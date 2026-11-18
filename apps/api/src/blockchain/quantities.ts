import { RpcFault } from './rpc-errors.js';

export const MAX_UINT256 = (1n << 256n) - 1n;
export function uint256(value: unknown): bigint {
  if (typeof value !== 'bigint' || value < 0n || value > MAX_UINT256)
    throw new RpcFault('INVALID_RETURN_DATA');
  return value;
}
export function decimals(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 255
  )
    throw new RpcFault('INVALID_RETURN_DATA');
  return value;
}
export function metadata(value: unknown, max: number): string {
  if (
    typeof value !== 'string' ||
    [...value].length > max ||
    /\uFFFD/u.test(value)
  )
    throw new RpcFault('INVALID_RETURN_DATA');
  const sanitized = value.replace(/[\p{Cc}\p{Cf}]/gu, '').trim();
  if (!sanitized) throw new RpcFault('INVALID_RETURN_DATA');
  return sanitized;
}
export function formatExact(
  value: bigint,
  scale: number | null,
): string | null {
  uint256(value);
  if (scale === null) return null;
  decimals(scale);
  if (scale === 0) return value.toString();
  const digits = value.toString().padStart(scale + 1, '0');
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return digits.slice(0, -scale) + (fraction ? `.${fraction}` : '');
}
