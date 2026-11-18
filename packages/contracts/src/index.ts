import { z } from 'zod';

export { normalizeAddress, ethereumAddressSchema } from './address.js';
export type { EthereumAddress } from './address.js';

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

export const foundationErrorCodeSchema = z.enum([
  'INVALID_REQUEST',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'INTERNAL_ERROR',
  'SERVICE_NOT_READY',
]);
export const errorEnvelopeSchema = z.strictObject({
  requestId: z.uuid(),
  error: z.strictObject({
    code: foundationErrorCodeSchema,
    message: z.string(),
    retryable: z.boolean(),
  }),
});
export type Liveness = z.infer<typeof livenessSchema>;
export type Readiness = z.infer<typeof readinessSchema>;
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
