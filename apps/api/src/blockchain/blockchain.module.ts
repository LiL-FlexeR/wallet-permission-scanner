import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApiEnvironment } from '../config/environment.js';
import { RegistryService } from '../registry/registry.service.js';
import { BoundedRpc } from './bounded-rpc.js';
import { BlockchainReadiness } from './blockchain-readiness.js';
import { DemoEthereumReader } from './demo-ethereum.reader.js';
import { ETHEREUM_READER } from './ethereum-reader.js';
import type { EthereumReader } from './ethereum-reader.js';
import { ViemEthereumReader } from './viem-ethereum.reader.js';

export type ScanMode = ApiEnvironment['SCAN_MODE'];

@Module({
  providers: [
    RegistryService,
    {
      provide: ETHEREUM_READER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): EthereumReader => {
        const env = config.getOrThrow<ApiEnvironment>('app');
        return env.SCAN_MODE === 'demo'
          ? new DemoEthereumReader()
          : new ViemEthereumReader(new BoundedRpc(env.ETHEREUM_RPC_URL!));
      },
    },
    {
      provide: BlockchainReadiness,
      inject: [ConfigService, ETHEREUM_READER],
      useFactory: (config: ConfigService, reader: EthereumReader) =>
        new BlockchainReadiness(
          config.getOrThrow<ApiEnvironment>('app').SCAN_MODE,
          reader,
        ),
    },
  ],
  exports: [ETHEREUM_READER, RegistryService, BlockchainReadiness],
})
export class BlockchainModule {}
