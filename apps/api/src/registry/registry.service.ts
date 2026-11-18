import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApiEnvironment } from '../config/environment.js';
import { demoRegistry } from '../blockchain/demo-ethereum.reader.js';
import { mainnetRegistry } from './mainnet.registry.js';
import type { Registry } from './registry.js';

@Injectable()
export class RegistryService {
  readonly snapshot: Registry;
  constructor(@Inject(ConfigService) config: ConfigService) {
    this.snapshot =
      config.getOrThrow<ApiEnvironment>('app').SCAN_MODE === 'demo'
        ? demoRegistry
        : mainnetRegistry;
  }
}
