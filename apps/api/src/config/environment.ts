import { isIP } from 'node:net';
import { scanModeSchema } from '@wps/contracts';
import { z } from 'zod';

function isHttpUrl(value: string, originOnly = false): boolean {
  try {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !url.hostname.includes('*') &&
      (!originOnly || (url.pathname === '/' && !url.search))
    );
  } catch {
    return false;
  }
}

function validCidrs(value: string): boolean {
  if (value === '') return true;
  return value.split(',').every((entry) => {
    const parts = entry.trim().split('/');
    const [address = '', prefix = ''] = parts;
    const family = isIP(address);
    return (
      parts.length === 2 &&
      family !== 0 &&
      /^(0|[1-9]\d*)$/.test(prefix) &&
      Number(prefix) <= (family === 4 ? 32 : 128) &&
      Number(prefix) > 0
    );
  });
}

const schema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z
      .string()
      .regex(/^[1-9]\d*$/)
      .default('3001')
      .transform(Number)
      .pipe(z.number().int().min(1).max(65535)),
    SCAN_MODE: scanModeSchema.default('live'),
    ETHEREUM_RPC_URL: z.string().optional(),
    WEB_ORIGIN: z
      .string()
      .refine((v) => isHttpUrl(v, true))
      .default('http://localhost:3000')
      .transform((v) => new URL(v).origin),
    TRUSTED_PROXY_CIDRS: z
      .string()
      .refine(validCidrs)
      .default('')
      .transform((v) => (v === '' ? [] : v.split(',').map((s) => s.trim()))),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  })
  .superRefine((env, ctx) => {
    const rpc = env.ETHEREUM_RPC_URL;
    if (
      (env.SCAN_MODE === 'live' && !rpc) ||
      (rpc &&
        (!isHttpUrl(rpc) ||
          (env.NODE_ENV === 'production' &&
            new URL(rpc).protocol !== 'https:')))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['ETHEREUM_RPC_URL'],
        message: 'invalid_rpc_configuration',
      });
    }
  });

export type ApiEnvironment = z.infer<typeof schema>;

export function validateApiEnvironment(
  input: Record<string, unknown>,
): ApiEnvironment {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fields = [
      ...new Set(parsed.error.issues.map((issue) => String(issue.path[0]))),
    ].sort();
    throw new Error(`Invalid API configuration: ${fields.join(', ')}.`);
  }
  return parsed.data;
}
