import { test, expect } from '../support/scenario';
import {
  scanSuccessSchema,
  errorEnvelopeSchema,
} from '../../packages/contracts/src/index';

const wallet = `0x${'3'.repeat(40)}`;

test('isolated real reader → Nest → Next → browser: inactive records, sorting and no persistent results', async ({
  page,
  backend,
}) => {
  await page.goto(backend.origin);
  await page
    .getByRole('textbox', { name: 'Ethereum wallet address' })
    .fill(wallet);
  const response = page.waitForResponse('**/api/v1/scans');
  await page.getByRole('button', { name: 'Scan address' }).click();
  const scan = scanSuccessSchema.parse(await (await response).json());
  expect(scan.summary).toEqual({ active: 0, inactive: 3, unknown: 0 });
  await expect(
    page.getByText('No active permissions were found in the configured set', {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByLabel('Sort by', { exact: true }).selectOption('spender');
  await page.getByLabel('Sort direction').selectOption('asc');
  const ordered = [...scan.permissions].sort(
    (a, b) =>
      a.spender.address.localeCompare(b.spender.address) ||
      a.id.localeCompare(b.id),
  );
  for (const [index, record] of ordered.entries()) {
    const article = page.getByRole('article').nth(index);
    await expect(
      article.getByText(record.token.address, { exact: true }),
    ).toBeVisible();
    await expect(
      article.getByText(record.spender.address, { exact: true }),
    ).toBeVisible();
  }
  await page.getByLabel('Activity', { exact: true }).selectOption('active');
  await expect(
    page.getByRole('heading', { name: 'No matching permissions' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page.getByText('Showing 3 of 3 permissions')).toBeVisible();
  expect(backend.events.filter((e) => e.type === 'read')).toHaveLength(1);
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0]);
  expect(page.url()).toBe(`${backend.origin}/`);
  await page.reload();
  await expect(page.getByText(wallet, { exact: true })).toHaveCount(0);
});

test.describe('partial fields', () => {
  test.use({ scenario: 'partial-metadata' });
  test('real reader failures preserve max uint256, unknown allowance and metadata as text', async ({
    page,
    backend,
  }) => {
    await page.goto(backend.origin);
    await page
      .getByRole('textbox', { name: 'Ethereum wallet address' })
      .fill(wallet);
    const response = page.waitForResponse('**/api/v1/scans');
    await page.getByRole('button', { name: 'Scan address' }).click();
    const scan = scanSuccessSchema.parse(await (await response).json());
    expect(scan.status).toBe('partial');
    expect(scan.summary.unknown).toBe(1);
    expect(scan.permissions[0]!.risk).toMatchObject({
      level: 'high',
      assessment: 'limited',
    });
    expect(scan.permissions[0]!.allowance!.formatted).toBeNull();
    await expect(
      page.getByRole('heading', { name: 'An incomplete view.' }),
    ).toBeVisible();
    await expect(
      page.getByText('<img src=x onerror=alert(1)>', { exact: true }),
    ).toHaveCount(3);
    expect(await page.locator('img').count()).toBe(0);
    await expect(
      page.getByText(
        `${scan.permissions[0]!.allowance!.raw} raw units (decimals unavailable)`,
        { exact: true },
      ),
    ).toBeVisible();
    await page
      .getByLabel('Exposure level', { exact: true })
      .selectOption('unknown');
    await expect(page.getByText('Showing 1 of 3 permissions')).toBeVisible();
    await page.getByLabel('Activity', { exact: true }).selectOption('inactive');
    await expect(
      page.getByRole('heading', { name: 'No matching permissions' }),
    ).toBeVisible();
    expect(await backend.state()).toBe(0);
  });
});

test.describe('provider failure', () => {
  test.use({ scenario: 'provider-failure' });
  test('real API error keeps no-store and request identity; no successful fallback', async ({
    page,
    backend,
  }) => {
    await page.goto(backend.origin);
    await page
      .getByRole('textbox', { name: 'Ethereum wallet address' })
      .fill(wallet);
    const pending = page.waitForResponse('**/api/v1/scans');
    await page.getByRole('button', { name: 'Scan address' }).click();
    const response = await pending;
    expect(response.status()).toBe(503);
    const body = errorEnvelopeSchema.parse(await response.json());
    expect(body.error.code).toBe('RPC_UNAVAILABLE');
    expect(body.requestId).toBe(response.headers()['x-request-id']);
    expect(response.headers()['cache-control']).toBe('no-store');
    await expect(
      page.getByRole('heading', { name: 'Scan unavailable' }),
    ).toBeVisible();
    await expect(page.getByText(`Request ID: ${body.requestId}`)).toBeVisible();
    expect(await backend.state()).toBe(0);
  });
});

test('real proxy strips spoofed identities even with loopback trusted; malformed attempts exhaust one bucket', async ({
  page,
  backend,
}) => {
  await page.goto(backend.origin);
  for (let i = 0; i < 10; i++) {
    const response = await page.request.post(`${backend.origin}/api/v1/scans`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': `203.0.113.${i}`,
        'X-Real-IP': `203.0.113.${i}`,
        Forwarded: `for=203.0.113.${i}`,
        'X-Request-Id': 'spoofed',
      },
      data: '{',
    });
    expect(response.status()).toBe(400);
    const body = errorEnvelopeSchema.parse(await response.json());
    expect(body.requestId).toBe(response.headers()['x-request-id']);
    expect(body.requestId).not.toBe('spoofed');
    expect(response.headers()['cache-control']).toBe('no-store');
  }
  await page
    .getByRole('textbox', { name: 'Ethereum wallet address' })
    .fill(wallet);
  await page.getByRole('button', { name: 'Scan address' }).click();
  await expect(page.getByRole('button', { name: /Retry in/ })).toBeDisabled();
  expect(backend.events.filter((e) => e.type === 'read')).toHaveLength(0);
  // A direct trusted hop can provide a new identity; the web hop intentionally cannot.
  const direct = await page.request.post(`${backend.target}/api/v1/scans`, {
    headers: { 'X-Forwarded-For': '203.0.113.77' },
    data: { address: wallet },
  });
  expect(direct.status()).toBe(200);
  expect(
    (await page.request.get(`${backend.origin}/api/v1/coverage`)).status(),
  ).toBe(200);
});

test.describe('abort propagation', () => {
  test.use({ scenario: 'cancel' });
  for (const action of ['cancel', 'navigate'] as const) {
    test(`browser ${action} aborts real proxy and reader, then frees scan capacity`, async ({
      page,
      backend,
    }) => {
      await page.goto(backend.origin);
      await page
        .getByRole('textbox', { name: 'Ethereum wallet address' })
        .fill(wallet);
      await page.getByRole('button', { name: 'Scan address' }).click();
      await expect
        .poll(() => backend.events.some((e) => e.type === 'read'))
        .toBe(true);
      if (action === 'cancel')
        await page.getByRole('button', { name: 'Cancel scan' }).click();
      else await page.goto('about:blank');
      await expect
        .poll(() => backend.events.some((e) => e.type === 'aborted'))
        .toBe(true);
      await expect.poll(() => backend.state()).toBe(0);
    });
  }
});
