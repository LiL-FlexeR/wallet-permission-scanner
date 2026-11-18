import { keccak_256 } from '@noble/hashes/sha3.js';
import { z } from 'zod';

export type EthereumAddress = `0x${string}`;

/** EIP-55 over lowercase ASCII hex. No Node, provider, or client dependency. */
export function normalizeAddress(input: unknown): EthereumAddress {
  if (typeof input !== 'string' || input.length > 128)
    throw new Error('INVALID_ADDRESS');
  const address = input.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(address) || /^0x0{40}$/.test(address))
    throw new Error('INVALID_ADDRESS');
  const body = address.slice(2);
  const lower = body.toLowerCase();
  const hash = Array.from(
    keccak_256(Uint8Array.from(lower, (char) => char.charCodeAt(0))),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
  const checksum = Array.from(lower, (char, index) =>
    Number.parseInt(hash[index]!, 16) >= 8 ? char.toUpperCase() : char,
  ).join('');
  if (body !== lower && body !== body.toUpperCase() && body !== checksum)
    throw new Error('INVALID_ADDRESS');
  return `0x${checksum}`;
}

export const ethereumAddressSchema = z.unknown().transform((value, ctx) => {
  try {
    return normalizeAddress(value);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'invalid_format_or_checksum' });
    return z.NEVER;
  }
});
