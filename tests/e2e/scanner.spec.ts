import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  completeScanFixture,
  coverageFixture,
  inactiveScanFixture,
  partialScanFixture,
  unknownScanFixture,
  metadataScanFixture,
} from '../fixtures/scans';

const wallet = completeScanFixture.walletAddress;
const addressInput = (page: Page) =>
  page.getByRole('textbox', { name: 'Ethereum wallet address' });
const scanButton = (page: Page) =>
  page.getByRole('button', { name: 'Scan address' });

test('production CSP uses fresh nonces, blocks injected scripts/connections and keeps the scanner functional', async ({
  page,
}) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('Content Security Policy'))
      violations.push(message.text());
  });
  const response = await page.goto('/');
  const policy = response!.headers()['content-security-policy']!;
  expect(policy).toContain("'strict-dynamic'");
  expect(policy).not.toMatch(/unsafe-inline|unsafe-eval/);
  expect(policy).toContain("style-src-attr 'none'");
  expect(response!.headers()['referrer-policy']).toBe('no-referrer');
  expect(response!.headers()['x-content-type-options']).toBe('nosniff');
  expect(response!.headers()['x-frame-options']).toBe('DENY');
  expect(response!.headers()['cache-control']).toContain('no-store');
  const nonce = /'nonce-([^']+)'/.exec(policy)![1]!;
  const scripts = await page
    .locator('script')
    .evaluateAll((nodes) => nodes.map((n) => (n as HTMLScriptElement).nonce));
  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.every((value) => value === nonce)).toBe(true);
  await expect(
    page.getByText('Synthetic demo coverage', { exact: false }),
  ).toBeVisible();
  expect(violations).toEqual([]);
  const fresh = await page.request.get('/', {
    headers: {
      'Content-Security-Policy': "script-src 'unsafe-inline'",
      'x-nonce': nonce,
    },
  });
  expect(fresh.headers()['content-security-policy']).not.toBe(policy);
  expect(fresh.headers()['content-security-policy']).not.toContain(
    'unsafe-inline',
  );
  // Inject at the HTML boundary. DevTools evaluation is privileged and cannot
  // model a parser-inserted attack under strict-dynamic.
  await page.route('http://127.0.0.1:3100/', async (route) => {
    const upstream = await route.fetch();
    const body = (await upstream.text()).replace(
      '</body>',
      '<script>document.documentElement.dataset.injected="executed"</script></body>',
    );
    await route.fulfill({ response: upstream, body });
  });
  await page.goto('/');
  const executed = await page.evaluate(async () => {
    let blocked = false;
    try {
      await fetch('https://outside.invalid/credential');
    } catch {
      blocked = true;
    }
    return { injected: document.documentElement.dataset.injected, blocked };
  });
  expect(executed).toEqual({ injected: undefined, blocked: true });
});
async function fixture(page: Page, data: unknown = completeScanFixture) {
  await page.route('**/api/v1/coverage', (route) =>
    route.fulfill({ json: coverageFixture }),
  );
  await page.route('**/api/v1/scans', (route) => route.fulfill({ json: data }));
  await page.goto('/');
}
async function submit(page: Page) {
  await addressInput(page).fill(wallet);
  await addressInput(page).press('Enter');
}

test('real production web → proxy → demo API: keyboard scan, identity, filters and exact source/snapshot disclosures', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(
    page.getByText('Synthetic demo coverage', { exact: false }),
  ).toBeVisible();
  await submit(page);
  await expect(
    page.getByRole('heading', { name: 'Your permission view.' }),
  ).toBeVisible();
  await expect(page.locator('.permission')).toHaveCount(3);
  await expect(page.locator('.result-wallet')).toContainText(wallet);
  await addressInput(page).fill(`0x${'5'.repeat(40)}`);
  await expect(page.locator('.result-wallet')).toContainText(wallet);
  await expect(page.locator('#results')).toContainText(
    'No live blockchain reads were made',
  );
  await expect(
    page.locator('#results a[href^="https://etherscan.io"]'),
  ).toHaveCount(0);
  await page.getByText('Snapshot & scan details').click();
  await expect(page.locator('.snapshot')).toContainText('Synthetic block');
  await page.locator('#filter-risk').selectOption('unknown');
  await expect(
    page.getByRole('heading', { name: 'No matching permissions' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page.locator('.permission')).toHaveCount(3);
  await expect(page).toHaveURL('http://127.0.0.1:3100/');
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 });
  expect(errors).toEqual([]);
});

test('invalid input and checksum make no scan call; validation is discoverable and keyboard focus returns', async ({
  page,
}) => {
  let scans = 0;
  await page.route('**/api/v1/scans', async (route) => {
    scans++;
    await route.abort();
  });
  await page.goto('/');
  await expect(addressInput(page)).toHaveAttribute('aria-invalid', 'false');
  for (const input of [
    'alice.eth',
    `0x${'0'.repeat(40)}`,
    '0x52908400098527886E0F7030069857D2E4169Ee7',
  ]) {
    await addressInput(page).fill(input);
    await scanButton(page).click();
    await expect(addressInput(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(addressInput(page)).toBeFocused();
    await expect(page.locator('#address-error')).toBeVisible();
  }
  expect(scans).toBe(0);
});

test('inactive-only success retains inactive records and distinguishes filter emptiness', async ({
  page,
}) => {
  await fixture(page, inactiveScanFixture);
  await submit(page);
  await expect(
    page.getByText('No active permissions were found in the configured set', {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.locator('.permission')).toHaveCount(1);
  await page.locator('#filter-activity').selectOption('active');
  await expect(
    page.getByRole('heading', { name: 'No matching permissions' }),
  ).toBeVisible();
});

test('partial with a zero-valued readable allowance and unknown pair never becomes a clean claim; filters combine', async ({
  page,
}) => {
  await fixture(page, unknownScanFixture);
  await submit(page);
  await expect(
    page.getByRole('heading', { name: 'An incomplete view.' }),
  ).toBeVisible();
  await expect(page.locator('.permission')).toHaveCount(2);
  await expect(
    page.getByText('No active permissions were found', { exact: false }),
  ).toHaveCount(0);
  await expect(
    page.getByText('Unavailable fields', { exact: true }),
  ).toBeVisible();
  await page
    .locator('#filter-spender')
    .selectOption(unknownScanFixture.permissions[1]!.spender.address);
  await page.locator('#filter-activity').selectOption('inactive');
  await expect(page.locator('.permission')).toHaveCount(0);
  await page.locator('#filter-activity').selectOption('unknown');
  await page.locator('#filter-risk').selectOption('unknown');
  await expect(page.locator('.permission')).toHaveCount(1);
  await page.getByText('Why this exposure level?', { exact: false }).click();
  await expect(
    page
      .locator('.explanations')
      .getByText('Allowance could not be read.', { exact: false }),
  ).toBeVisible();
});

test('malicious metadata is text, unavailable decimals retain max uint256 and field-specific warnings', async ({
  page,
}) => {
  await fixture(page, metadataScanFixture);
  await submit(page);
  await expect(
    page.getByText('<img src=x onerror=alert(1)>', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.permission img')).toHaveCount(0);
  await expect(page.locator('.amount').first()).toHaveText(
    `${metadataScanFixture.permissions[0]!.allowance!.raw} raw units (decimals unavailable)`,
  );
  await expect(page.locator('.field-warnings')).toContainText(
    'INVALID_RETURN_DATA',
  );
});

test('structured errors keep request ID; rate-limit and busy retries wait without automatic calls', async ({
  page,
}) => {
  for (const status of [429, 503]) {
    let calls = 0;
    await page.route('**/api/v1/scans', async (route) => {
      calls++;
      await route.fulfill({
        status,
        headers: { 'Retry-After': '2' },
        json: {
          requestId: completeScanFixture.requestId,
          error: {
            code: status === 429 ? 'RATE_LIMITED' : 'SCAN_CAPACITY_EXCEEDED',
            message: 'wait',
            retryable: true,
          },
        },
      });
    });
    await page.goto('/');
    await submit(page);
    await expect(page.getByRole('button', { name: /Retry in/ })).toBeDisabled();
    await expect(
      page.getByText(`Request ID: ${completeScanFixture.requestId}`),
    ).toBeVisible();
    await addressInput(page).press('Enter');
    expect(calls).toBe(1);
    await expect(scanButton(page)).toBeEnabled({ timeout: 4000 });
    expect(calls).toBe(1);
    await addressInput(page).press('Enter');
    await expect.poll(() => calls).toBe(2);
    await page.unroute('**/api/v1/scans');
  }
});

test('cancel, replace wallet and delayed old response cannot overwrite a newer result', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  await page.route('**/api/v1/scans', async (route) => {
    calls++;
    if (calls === 1) await gate;
    const address = route.request().postDataJSON().address as string;
    await route
      .fulfill({ json: { ...completeScanFixture, walletAddress: address } })
      .catch(() => {});
  });
  await page.goto('/');
  await submit(page);
  await expect(page.getByRole('progressbar')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel scan' }).click();
  const newer = `0x${'5'.repeat(40)}`;
  await addressInput(page).fill(newer);
  await addressInput(page).press('Enter');
  await expect(page.locator('.result-wallet')).toContainText(newer);
  release();
  await expect(page.locator('.result-wallet')).toContainText(newer);
  expect(calls).toBe(2);
});

test('coverage retry is independent; registry mismatch refreshes once without replacing scan data', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/api/v1/coverage', async (route) => {
    calls++;
    if (calls === 1)
      await route.fulfill({
        status: 503,
        contentType: 'text/html',
        body: '<html>gateway</html>',
      });
    else
      await route.fulfill({
        json: { ...coverageFixture, registryVersion: 'demo-2' },
      });
  });
  await page.route('**/api/v1/scans', (route) =>
    route.fulfill({ json: partialScanFixture }),
  );
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Coverage unavailable' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Retry coverage' }).click();
  await expect(page.locator('#coverage')).toContainText('Registry demo-2');
  await submit(page);
  await expect.poll(() => calls).toBe(3);
  await page.getByText('Snapshot & scan details').click();
  await expect(page.locator('.snapshot')).toContainText('demo-1 / mvp-1');
  await expect(page.locator('#coverage')).toContainText(
    'Current coverage differs',
  );
});

test('a new scan clears the previous wallet; the 20-second browser timeout aborts without retry', async ({
  page,
}) => {
  await page.clock.install();
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/coverage', (route) =>
    route.fulfill({ json: coverageFixture }),
  );
  await page.route('**/api/v1/scans', async (route) => {
    calls++;
    if (calls > 1) await gate;
    await route.fulfill({ json: completeScanFixture }).catch(() => {});
  });
  await page.goto('/');
  await submit(page);
  await expect(page.locator('.result-wallet')).toContainText(wallet);
  await addressInput(page).fill(`0x${'5'.repeat(40)}`);
  await scanButton(page).click();
  await expect(page.locator('.result-wallet')).toHaveCount(0);
  await expect(page.locator('.permission')).toHaveCount(0);
  await expect(page.getByRole('progressbar')).toBeVisible();
  await page.clock.fastForward(20_001);
  await expect(page.locator('.scan-status')).toContainText(
    'timed out after 20 seconds',
  );
  expect(calls).toBe(2);
  release();
});

test('offline transport has an explicit failure and never fabricates permission records', async ({
  page,
}) => {
  await page.route('**/api/v1/coverage', (route) =>
    route.fulfill({ json: coverageFixture }),
  );
  await page.route('**/api/v1/scans', (route) =>
    route.abort('internetdisconnected'),
  );
  await page.goto('/');
  await submit(page);
  await expect(page.locator('.scan-status')).toContainText(
    'Check your connection',
  );
  await expect(scanButton(page)).toBeEnabled();
  await expect(page.locator('.permission')).toHaveCount(0);
});

test('non-JSON errors and unsupported policy are integration failures, never fixture fallbacks', async ({
  page,
}) => {
  await fixture(page, {
    ...completeScanFixture,
    riskPolicyVersion: 'future-2',
  });
  await submit(page);
  await expect(page.locator('.scan-status')).toContainText(
    'Compatibility issue',
  );
  await expect(page.locator('.permission')).toHaveCount(0);
  await page.route('**/api/v1/scans', (route) =>
    route.fulfill({
      status: 504,
      contentType: 'text/html',
      body: 'internal gateway error',
    }),
  );
  await scanButton(page).click();
  await expect(page.locator('.scan-status')).toContainText(
    'unreadable response',
  );
  await expect(page.getByText('internal gateway error')).toHaveCount(0);
});

test('live links use fixed Etherscan origins and opener/referrer isolation', async ({
  page,
}) => {
  await fixture(page, { ...completeScanFixture, source: 'live' });
  await submit(page);
  const links = page.locator('#results a');
  await expect(links).toHaveCount(2);
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute(
      'href',
      /^https:\/\/etherscan\.io\/(token|address)\/0x[0-9a-fA-F]{40}$/,
    );
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(link).toHaveAttribute('referrerpolicy', 'no-referrer');
  }
});

test('desktop/mobile layouts, keyboard focus and automated accessibility checks', async ({
  page,
}) => {
  await fixture(page, metadataScanFixture);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Skip to scanner' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  const idle = await new AxeBuilder({ page }).analyze();
  expect(idle.violations).toEqual([]);
  await page.screenshot({ path: '/tmp/wps-stage04-idle.png', fullPage: true });
  await submit(page);
  await expect(page.locator('.permission')).toHaveCount(1);
  await page.getByText('Why this exposure level?', { exact: false }).click();
  await page.getByText('Snapshot & scan details').click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: '/tmp/wps-stage04-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: '/tmp/wps-stage04-mobile.png',
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
