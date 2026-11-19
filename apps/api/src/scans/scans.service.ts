import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  coverageResponseSchema,
  RISK_POLICY_VERSION,
  scanSuccessSchema,
} from '@wps/contracts';
import type { CoverageResponse, ScanSuccess } from '@wps/contracts';
import { ETHEREUM_READER } from '../blockchain/ethereum-reader.js';
import type { EthereumReader } from '../blockchain/ethereum-reader.js';
import { ReaderFailure } from '../blockchain/rpc-errors.js';
import { RPC_LIMITS, WorkBudget } from '../blockchain/work-budget.js';
import type { Clock } from '../blockchain/work-budget.js';
import { ApiError } from '../common/http/errors.js';
import type { ApiEnvironment } from '../config/environment.js';
import { RegistryService } from '../registry/registry.service.js';
import { mapCoverage, mapPermissions } from './permission.mapper.js';

export const SCAN_CLOCK = Symbol('ScanClock');
@Injectable()
export class ScansService {
  private stopped = false;
  private readonly active = new Map<WorkBudget, Promise<void>>();
  constructor(
    @Inject(ETHEREUM_READER) private readonly reader: EthereumReader,
    @Inject(RegistryService) private readonly registry: RegistryService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(SCAN_CLOCK) private readonly clock: Clock,
  ) {}
  get inFlight(): number {
    return this.active.size;
  }
  coverage(): CoverageResponse {
    if (this.stopped || !this.registry.snapshot)
      throw new ApiError('SERVICE_NOT_READY');
    return coverageResponseSchema.parse(
      mapCoverage(
        this.registry.snapshot,
        this.config.getOrThrow<ApiEnvironment>('app').SCAN_MODE,
      ),
    );
  }
  async scan(
    address: string,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<ScanSuccess> {
    if (this.stopped || !this.registry.snapshot)
      throw new ApiError('SERVICE_NOT_READY');
    if (this.active.size >= RPC_LIMITS.scans)
      throw new ApiError('SCAN_CAPACITY_EXCEEDED');
    const context = new WorkBudget(RPC_LIMITS.scanMs, this.clock, signal);
    const startedAt = new Date(this.clock.unixMs()).toISOString();
    const registry = this.registry.snapshot;
    let finish!: () => void;
    this.active.set(
      context,
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    try {
      const read = await this.reader.read({
        owner: address,
        registry,
        context,
      });
      if (
        read.source !==
          this.config.getOrThrow<ApiEnvironment>('app').SCAN_MODE ||
        read.owner !== address
      )
        throw new Error('INCONSISTENT_READER_RESULT');
      const mapped = mapPermissions(registry, read);
      if (mapped.coverage.checkedPairs === 0)
        throw new ApiError(
          context.remaining() <= 0 ? 'SCAN_TIMEOUT' : 'RPC_UNAVAILABLE',
        );
      return scanSuccessSchema.parse({
        requestId,
        source: read.source,
        chainId: 1,
        walletAddress: read.owner,
        registryVersion: registry.registryVersion,
        riskPolicyVersion: RISK_POLICY_VERSION,
        startedAt,
        completedAt: new Date(this.clock.unixMs()).toISOString(),
        snapshot: {
          ...read.snapshot,
          blockNumber: read.snapshot.blockNumber.toString(),
          blockTimestamp: new Date(
            Number(read.snapshot.blockTimestamp * 1000n),
          ).toISOString(),
        },
        ...mapped,
      });
    } catch (error) {
      if (error instanceof ReaderFailure)
        throw new ApiError(
          error.code === 'CANCELLED' ? 'SCAN_TIMEOUT' : error.code,
        );
      throw error;
    } finally {
      // Reader settles in-flight work before resolving; never release early via Promise.race.
      context.dispose();
      this.active.delete(context);
      finish();
    }
  }
  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    for (const context of this.active.keys()) context.controller.abort();
    await Promise.all(this.active.values());
  }
}
