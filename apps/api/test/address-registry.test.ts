import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ethereumAddressSchema, normalizeAddress } from '@wps/contracts';
import { mainnetRegistry } from '../src/registry/mainnet.registry.js';
import { validateRegistry } from '../src/registry/registry.js';
import {
  decimals,
  formatExact,
  MAX_UINT256,
  metadata,
  uint256,
} from '../src/blockchain/quantities.js';

test('shared EIP-55 normalizer accepts official vectors, uniform case, trimming and contract wallets', () => {
  const vectors = [
    '0x52908400098527886E0F7030069857D2E4169EE7',
    '0x8617E340B3D01FA5F11F306F4090FD50E238070D',
    '0xde709f2102306220921060314715629080e2fb77',
    '0x27b1fdb04752bbc536007a920d24acb045561c26',
    '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
    '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
    '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB',
    '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb',
    mainnetRegistry.pairs[0]!.spender.address,
  ];
  for (const v of vectors) {
    assert.equal(normalizeAddress(v), v);
    assert.equal(normalizeAddress(v.toLowerCase()), v);
    assert.equal(
      ethereumAddressSchema.parse(` \t0x${v.slice(2).toUpperCase()}\n`),
      v,
    );
  }
  for (const v of [
    null,
    1,
    [],
    {},
    'vitalik.eth',
    `0x${'0'.repeat(40)}`,
    '0x123',
    `0X${'1'.repeat(40)}`,
    `1:0x${'1'.repeat(40)}`,
    `https://example.com/0x${'1'.repeat(40)}`,
    `0x${'g'.repeat(40)}`,
    '0x5Aaeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
    `${' '.repeat(100)}${vectors[0]}`,
    `0x${'1'.repeat(20)} ${'1'.repeat(20)}`,
  ]) {
    assert.throws(() => normalizeAddress(v), /^Error: INVALID_ADDRESS$/);
    assert.equal(ethereumAddressSchema.safeParse(v).success, false);
  }
});

function registryInput() {
  return {
    ...mainnetRegistry,
    pairs: mainnetRegistry.pairs.map(({ token, spender }) => ({
      token: { ...token },
      spender: { ...spender },
    })),
  };
}
test('registry normalizes stable tuple IDs and produces an immutable bounded explicit snapshot', () => {
  const input = registryInput();
  input.pairs.reverse();
  for (const pair of input.pairs) {
    pair.token.address = normalizeAddress(pair.token.address.toLowerCase());
  }
  const result = validateRegistry(input);
  assert.deepEqual(result, mainnetRegistry);
  assert.equal(result.pairs.length, 3);
  assert.equal(new Set(result.pairs.map((p) => p.token.address)).size, 2);
  assert.equal(new Set(result.pairs.map((p) => p.spender.address)).size, 2);
  assert.ok(
    Object.isFrozen(result) &&
      Object.isFrozen(result.pairs) &&
      Object.isFrozen(result.pairs[0]!.spender),
  );
});

test('registry rejects casing duplicates, inconsistent identity, invalid provenance, zero, bounds and unknown keys', () => {
  const invalid: unknown[] = [];
  let r = registryInput();
  r.pairs.push({
    ...r.pairs[0]!,
    token: {
      ...r.pairs[0]!.token,
      address: r.pairs[0]!.token.address.toLowerCase() as `0x${string}`,
    },
  });
  invalid.push(r);
  r = registryInput();
  r.pairs[0]!.token.label = 'Other label';
  invalid.push(r);
  r = registryInput();
  r.pairs[0]!.spender.identitySourceUrl = 'javascript:alert(1)';
  invalid.push(r);
  r = registryInput();
  r.pairs[0]!.spender.identitySourceUrl = 'https://user:secret@example.com';
  invalid.push(r);
  r = registryInput();
  r.pairs[0]!.spender.identitySourceUrl = 'https://example.com\n';
  invalid.push(r);
  r = registryInput();
  r.pairs[0]!.spender.identityReviewedAt = '2026-02-30';
  invalid.push(r);
  r = registryInput();
  r.pairs[0]!.spender.label = null;
  invalid.push(r);
  r = registryInput();
  r.pairs[0]!.spender.identity = 'unverified';
  invalid.push(r);
  r = registryInput();
  r.pairs[0]!.token.address = `0x${'0'.repeat(40)}`;
  invalid.push(r);
  r = registryInput();
  r.pairs[0]!.token.label = 'x'.repeat(121);
  invalid.push(r);
  r = registryInput();
  r.pairs[0]!.token.label = 'bad\nlabel';
  invalid.push(r);
  invalid.push(
    { ...registryInput(), pairs: [] },
    { ...registryInput(), chainId: 2 },
    { ...registryInput(), registryVersion: '' },
    { ...registryInput(), arbitrary: true },
  );
  const entity = registryInput().pairs[0]!.token;
  const unique = (n: number) => ({
    ...entity,
    address: `0x${n.toString(16).padStart(40, '0')}`,
    identity: 'unverified',
    label: null,
    identitySourceUrl: null,
    identityReviewedAt: null,
  });
  invalid.push({
    ...registryInput(),
    pairs: Array.from({ length: 21 }, (_, i) => ({
      token: unique(1),
      spender: unique(100 + i),
    })),
  });
  invalid.push({
    ...registryInput(),
    pairs: Array.from({ length: 6 }, (_, i) => ({
      token: unique(1 + i),
      spender: unique(100),
    })),
  });
  for (const value of invalid)
    assert.throws(() => validateRegistry(value), /^Error: INVALID_REGISTRY$/);
});

test('exact quantities retain uint256 maxima, decimals 0/255 and unknown scaling', () => {
  assert.equal(uint256(MAX_UINT256), MAX_UINT256);
  assert.equal(formatExact(MAX_UINT256, 0), MAX_UINT256.toString());
  assert.equal(formatExact(123_000_000n, 6), '123');
  assert.equal(formatExact(1n, 255), `0.${'0'.repeat(254)}1`);
  assert.equal(formatExact(0n, 255), '0');
  assert.equal(formatExact(9_007_199_254_740_993n, 6), '9007199254.740993');
  assert.equal(formatExact(1n, null), null);
  for (const value of [-1n, MAX_UINT256 + 1n, 1, '1', null])
    assert.throws(() => uint256(value));
  for (const value of [-1, 256, 1.5, NaN, 18n, null])
    assert.throws(() => decimals(value));
  assert.equal(metadata(' A\u0000\nB\u202e ', 120), 'AB');
  assert.equal(metadata('<script>text</script>', 120), '<script>text</script>');
  for (const value of ['', '\n', 'a'.repeat(121), 1, '\uFFFD'])
    assert.throws(() => metadata(value, 120));
});
