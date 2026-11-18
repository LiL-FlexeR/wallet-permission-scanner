import { z } from 'zod';

const schema = z.object({
  API_PROXY_TARGET: z
    .string()
    .default('http://localhost:3001')
    .refine((value) => {
      try {
        const url = new URL(value);
        return (
          ['http:', 'https:'].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          url.pathname === '/' &&
          !url.search &&
          !url.hash &&
          !url.hostname.includes('*')
        );
      } catch {
        return false;
      }
    })
    .transform((value) => new URL(value).origin),
});

export type WebEnvironment = z.infer<typeof schema>;

export function validateWebEnvironment(
  input: Record<string, unknown>,
): WebEnvironment {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new Error('Invalid web configuration: API_PROXY_TARGET.');
  return result.data;
}
