import { z } from 'zod';

export { normalizeAddress, ethereumAddressSchema } from './address.js';
export type { EthereumAddress } from './address.js';
export * from './scans.js';

export const scanModeSchema = z.enum(['live', 'demo']);
export const livenessSchema = z.strictObject({ status: z.literal('ok') });
export const readinessSchema = z.strictObject({
  status: z.enum(['ready', 'not_ready']),
  mode: scanModeSchema,
  checks: z.strictObject({
    configuration: z.literal('ok'),
    blockchain: z.enum(['not_required', 'ok', 'unavailable']),
  }),
});

export const errorCodeSchema = z.enum([
  'INVALID_REQUEST',
  'INVALID_ADDRESS',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'INTERNAL_ERROR',
  'SERVICE_NOT_READY',
  'RATE_LIMITED',
  'SCAN_CAPACITY_EXCEEDED',
  'CHAIN_MISMATCH',
  'SNAPSHOT_UNAVAILABLE',
  'RPC_UNAVAILABLE',
  'SCAN_TIMEOUT',
]);
export const foundationErrorCodeSchema = errorCodeSchema;
export const errorEnvelopeSchema = z.strictObject({
  requestId: z.uuid(),
  error: z.strictObject({
    code: errorCodeSchema,
    message: z.string().min(1).max(200),
    retryable: z.boolean(),
    details: z
      .array(
        z.strictObject({
          field: z.literal('address'),
          issue: z.literal('invalid_format_or_checksum'),
        }),
      )
      .max(1)
      .optional(),
  }),
});
export type Liveness = z.infer<typeof livenessSchema>;
export type Readiness = z.infer<typeof readinessSchema>;
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export { assessPermission, LARGE_ALLOWANCE_MULTIPLIER } from './risk.js';
