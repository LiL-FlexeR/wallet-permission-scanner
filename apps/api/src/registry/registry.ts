import { ethereumAddressSchema } from '@wps/contracts';
import { z } from 'zod';

const text = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((s) => !/[\p{Cc}\p{Cf}]/u.test(s));
const sourceUrl = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        value === value.trim() &&
        !/[\p{Cc}\p{Cf}]/u.test(value) &&
        url.protocol === 'https:' &&
        !!url.hostname &&
        !url.username &&
        !url.password &&
        !url.hostname.includes('*')
      );
    } catch {
      return false;
    }
  });
const reviewDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const date = new Date(s);
    return (
      Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === s
    );
  });
const identityFields = z.discriminatedUnion('identity', [
  z.strictObject({
    identity: z.literal('verified'),
    label: text(120),
    identitySourceUrl: sourceUrl,
    identityReviewedAt: reviewDate,
  }),
  z.strictObject({
    identity: z.literal('unverified'),
    label: z.null(),
    identitySourceUrl: z.null(),
    identityReviewedAt: z.null(),
  }),
]);
const entity = z
  .strictObject({
    address: ethereumAddressSchema,
    ...{
      identity: z.enum(['verified', 'unverified']),
      label: text(120).nullable(),
      identitySourceUrl: sourceUrl.nullable(),
      identityReviewedAt: reviewDate.nullable(),
    },
  })
  .refine(
    ({ identity, label, identitySourceUrl, identityReviewedAt }) =>
      identityFields.safeParse({
        identity,
        label,
        identitySourceUrl,
        identityReviewedAt,
      }).success,
  );
const registrySchema = z.strictObject({
  registryVersion: z.string().regex(/^[a-z0-9][a-z0-9.-]{0,63}$/),
  chainId: z.literal(1),
  limitation: text(500),
  pairs: z
    .array(z.strictObject({ token: entity, spender: entity }))
    .min(1)
    .max(20),
});

export type RegistryEntity = Readonly<z.infer<typeof entity>>;
export interface SupportedPair {
  readonly id: string;
  readonly token: RegistryEntity;
  readonly spender: RegistryEntity;
}
export interface Registry {
  readonly registryVersion: string;
  readonly chainId: 1;
  readonly limitation: string;
  readonly pairs: readonly SupportedPair[];
}

/** Fail startup without echoing rejected addresses, labels, or URLs. */
export function validateRegistry(input: unknown): Registry {
  const parsed = registrySchema.safeParse(input);
  if (!parsed.success) throw new Error('INVALID_REGISTRY');
  const { pairs, ...header } = parsed.data;
  const ids = new Set<string>();
  const tokens = new Set<string>();
  const identities = new Map<string, string>();
  const normalized = pairs.map(({ token, spender }) => {
    const id = `1:${token.address.toLowerCase()}:${spender.address.toLowerCase()}`;
    if (ids.has(id)) throw new Error('INVALID_REGISTRY');
    ids.add(id);
    tokens.add(token.address.toLowerCase());
    for (const item of [token, spender]) {
      const { address, ...identity } = item;
      const key = address.toLowerCase();
      const value = JSON.stringify(identity);
      if (identities.has(key) && identities.get(key) !== value)
        throw new Error('INVALID_REGISTRY');
      identities.set(key, value);
    }
    return Object.freeze({
      id,
      token: Object.freeze(token),
      spender: Object.freeze(spender),
    });
  });
  if (tokens.size > 5) throw new Error('INVALID_REGISTRY');
  normalized.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return Object.freeze({ ...header, pairs: Object.freeze(normalized) });
}
