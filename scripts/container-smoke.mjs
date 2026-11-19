import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, writeFile, unlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import {
  coverageResponseSchema,
  scanSuccessSchema,
} from '../packages/contracts/dist/index.js';

const execute = promisify(execFile);
const project = `wps-smoke-${randomUUID().slice(0, 8)}`;
const sentinel = 'release-redaction-sentinel';
const env = {
  ...process.env,
  SCAN_MODE: 'demo',
  ETHEREUM_RPC_URL: '',
  WEB_ORIGIN: 'http://localhost:3000',
  WEB_HOST_PORT: '0',
  API_IMAGE:
    process.env.API_IMAGE || 'wallet-permission-scanner-api:stage06-local',
  WEB_IMAGE:
    process.env.WEB_IMAGE || 'wallet-permission-scanner-web:stage06-local',
};
const compose = [
  'compose',
  '-p',
  project,
  '-f',
  'infra/compose.production.yaml',
];
const extraContainers = new Set();
const sentinelFiles = [];
const temporary = await mkdtemp(path.join(tmpdir(), 'wps-image-audit-'));
async function docker(args, options = {}) {
  return (
    await execute('docker', args, {
      env,
      timeout: 180_000,
      maxBuffer: 8 * 1024 * 1024,
      ...options,
    })
  ).stdout.trim();
}
async function run(args) {
  await new Promise((resolve, reject) => {
    const child = spawn('docker', args, { env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Docker command failed (${code}).`)),
    );
  });
}
const owner = (digit) => `0x${digit.repeat(40)}`;
const inspect = async (id) => JSON.parse(await docker(['inspect', id]))[0];
async function containerLogs(id) {
  const result = await execute('docker', ['logs', id], {
    env,
    timeout: 10_000,
  });
  return result.stdout + result.stderr;
}
async function extra(name, image, variables, network = 'none') {
  const id = `${project}-${name}`;
  extraContainers.add(id);
  await docker([
    'run',
    '-d',
    '--name',
    id,
    '--label',
    `com.wps.smoke-project=${project}`,
    '--network',
    network,
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    ...variables.flatMap((value) => ['-e', value]),
    image,
  ]);
  return id;
}
async function waitExited(id) {
  await docker(['wait', id], { timeout: 15_000 });
  const result = await inspect(id);
  assert.notEqual(result.State.ExitCode, 0);
  const logs = await containerLogs(id);
  assert.ok(!logs.includes(sentinel));
  return logs;
}

let failure;
try {
  await docker([...compose, 'config', '--quiet']);
  for (const directory of ['.', 'apps/api', 'apps/web']) {
    for (const name of [`.env.${project}`, `${project}.env`]) {
      const file = `${directory}/${name}`;
      await writeFile(
        file,
        `ETHEREUM_RPC_URL=https://rpc.invalid/${sentinel}\n`,
        { flag: 'wx' },
      );
      sentinelFiles.push(file);
    }
  }
  if (!process.argv.includes('--skip-build')) await run([...compose, 'build']);
  for (const [service, image] of Object.entries({
    api: env.API_IMAGE,
    web: env.WEB_IMAGE,
  })) {
    const saved = path.join(temporary, `${service}.tar`);
    await docker(['image', 'save', '--output', saved, image]);
    const audit = await execute(
      'python3',
      ['scripts/image-audit.py', saved, sentinel],
      { timeout: 120_000 },
    );
    console.log(audit.stdout.trim());
    await unlink(saved);
  }
  await docker([
    ...compose,
    'up',
    '--no-build',
    '--wait',
    '--wait-timeout',
    '120',
  ]);
  const origin = `http://${await docker([...compose, 'port', 'web', '3000'])}`;
  const ids = {};
  for (const service of ['api', 'web']) {
    ids[service] = await docker([...compose, 'ps', '-q', service]);
    const state = await inspect(ids[service]);
    assert.equal(state.Config.User, '1000:1000');
    assert.equal(state.HostConfig.ReadonlyRootfs, true);
    if (service === 'api')
      assert.ok(!Object.values(state.NetworkSettings.Ports).some(Boolean));
    await docker([
      'exec',
      ids[service],
      'node',
      '-e',
      `
      const fs=require('node:fs');
      for(const p of ['/app/.git','/app/.env','/app/apps/api/src','/app/apps/api/test','/app/tests','/app/scripts'])
        if(fs.existsSync(p))throw Error('Unexpected source/test/secret file');
      if(process.getuid()===0)throw Error('Root user');
    `,
    ]);
  }
  const html = await fetch(origin);
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-security-policy'), /nonce-/);
  assert.match(html.headers.get('cache-control'), /no-store/);
  assert.equal(html.headers.get('x-frame-options'), 'DENY');
  const firstNonce = html.headers.get('content-security-policy');
  await html.text();
  assert.notEqual(
    (await fetch(origin)).headers.get('content-security-policy'),
    firstNonce,
  );
  const coverageResponse = await fetch(`${origin}/api/v1/coverage`);
  const coverage = coverageResponseSchema.parse(await coverageResponse.json());
  assert.equal(coverage.source, 'demo');
  assert.equal(coverage.registryVersion, 'demo-1');
  assert.equal(coverageResponse.headers.get('cache-control'), 'no-store');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin);
    for (const digit of ['3', '6', '7']) {
      await page
        .getByRole('textbox', { name: 'Ethereum wallet address' })
        .fill(owner(digit));
      await page.getByRole('button', { name: 'Scan address' }).click();
      await expect(page.locator('.result-wallet')).toContainText(owner(digit));
      await expect(page.locator('.permission')).toHaveCount(3);
      await expect(page.locator('#results')).toContainText(
        'No live blockchain reads were made',
      );
      await expect(
        page.locator('#results a[href^="https://etherscan.io"]'),
      ).toHaveCount(0);
      if (digit === '7')
        await expect(
          page.getByRole('heading', { name: 'An incomplete view.' }),
        ).toBeVisible();
      if (digit === '6')
        await expect(
          page.getByText(
            'No active permissions were found in the configured set',
            { exact: false },
          ),
        ).toBeVisible();
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
  async function scan(address, forwarded = '198.51.100.1') {
    return fetch(`${origin}/api/v1/scans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': forwarded,
        'X-Real-IP': forwarded,
        Forwarded: `for=${forwarded}`,
      },
      body: JSON.stringify({ address }),
    });
  }
  for (const digit of ['3', '6', '7']) {
    const response = await scan(owner(digit));
    assert.equal(response.status, 200);
    const result = scanSuccessSchema.parse(await response.json());
    assert.equal(result.source, 'demo');
    assert.equal(result.status, digit === '7' ? 'partial' : 'complete');
    assert.equal(result.summary.unknown, digit === '7' ? 1 : 0);
    if (digit === '6') assert.equal(result.summary.inactive, 3);
    else assert.equal(result.permissions[0].risk.level, 'high');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-request-id'), result.requestId);
  }
  for (let i = 0; i < 4; i++) {
    const response = await scan(sentinel, `203.0.113.${i}`);
    assert.equal(response.status, 400);
    assert.ok(!(await response.text()).includes(sentinel));
  }
  const limited = await scan(owner('3'), '192.0.2.99');
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) >= 1);
  assert.equal(limited.headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(`${origin}/api/health/ready`)).status, 404);
  await docker([
    'exec',
    ids.api,
    'node',
    '-e',
    `
    (async()=>{for(const path of ['/health/live','/health/ready']){
      const r=await fetch('http://localhost:3001'+path);if(r.status!==200)throw Error('Health');
    }if((await fetch('http://localhost:3001/api/docs')).status!==404)throw Error('Docs');})();
  `,
  ]);
  const logs = await docker([...compose, 'logs', '--no-color']);
  for (const forbidden of [sentinel, owner('3'), owner('6'), owner('7')])
    assert.ok(!logs.includes(forbidden));

  // Restart the identical web image against a second runtime destination.
  await docker([
    'exec',
    '-d',
    ids.web,
    'node',
    '-e',
    "require('node:http').createServer((q,r)=>{r.writeHead(418,{'Content-Type':'application/json'});r.end(JSON.stringify({target:'second-runtime'}));}).listen(3002,'0.0.0.0')",
  ]);
  const alternate = await extra(
    'alternate-web',
    env.WEB_IMAGE,
    ['API_PROXY_TARGET=http://web:3002'],
    `${project}_default`,
  );
  await docker([
    'exec',
    alternate,
    'node',
    '-e',
    `
    (async()=>{for(let i=0;i<50;i++){try{
      const r=await fetch('http://localhost:3000/api/v1/coverage');
      if(r.status===418&&(await r.json()).target==='second-runtime')return;
    }catch{}await new Promise(r=>setTimeout(r,100));}process.exit(1);})();
  `,
  ]);
  if (process.argv.includes('--fail-after-alternate'))
    throw new Error(
      'Intentional smoke failure after alternate network attachment.',
    );

  // The exact web image must reject invalid runtime configuration before listening.
  const invalidWeb = await extra('invalid-web', env.WEB_IMAGE, [
    `API_PROXY_TARGET=http://user:${sentinel}@localhost`,
  ]);
  assert.match(
    await waitExited(invalidWeb),
    /Invalid web configuration: API_PROXY_TARGET/,
  );
  const invalidApi = await extra('invalid-api', env.API_IMAGE, [
    'SCAN_MODE=live',
    `ETHEREUM_RPC_URL=invalid://${sentinel}`,
  ]);
  assert.match(
    await waitExited(invalidApi),
    /Invalid API configuration: ETHEREUM_RPC_URL/,
  );

  // No network is available: liveness survives a failed provider probe.
  const outage = await extra('outage', env.API_IMAGE, [
    'SCAN_MODE=live',
    `ETHEREUM_RPC_URL=https://rpc.invalid/${sentinel}`,
  ]);
  for (let attempt = 0; ; attempt++) {
    try {
      await docker([
        'exec',
        outage,
        'node',
        '-e',
        `
        (async()=>{for(const [p,s] of [['live',200],['ready',503]]){
          const r=await fetch('http://localhost:3001/health/'+p);if(r.status!==s)throw Error('Probe status');
        }})();
      `,
      ]);
      break;
    } catch (error) {
      if (attempt >= 30) throw error;
      await delay(100);
    }
  }
  assert.ok(!(await containerLogs(outage)).includes(sentinel));

  // Inspect shipped browser assets and the synthetic build-context sentinel.
  await docker([
    'exec',
    ids.web,
    'node',
    '-e',
    `
    const fs=require('node:fs');const path=require('node:path');
    function walk(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){
      const f=path.join(p,e.name);if(e.isDirectory())walk(f);else{
        const s=fs.readFileSync(f,'utf8');
        for(const v of ['ETHEREUM_RPC_URL','API_PROXY_TARGET','${sentinel}'])if(s.includes(v))throw Error('Browser secret leak');
      }
    }}walk('/app/apps/web/.next/static');
  `,
  ]);

  const before = Date.now();
  await docker([...compose, 'stop', 'api']);
  assert.ok(Date.now() - before < 10_000);
  assert.equal((await inspect(ids.api)).State.ExitCode, 0);
  const unavailable = await fetch(`${origin}/api/v1/coverage`);
  assert.equal(unavailable.status, 503);
  assert.ok(!(await unavailable.text()).includes(sentinel));
  const webStopping = Date.now();
  await docker([...compose, 'stop', 'web']);
  assert.ok(Date.now() - webStopping < 30_000);
  // Next 16.4.6 deliberately returns 128 + SIGTERM after its cleanup.
  assert.equal((await inspect(ids.web)).State.ExitCode, 143);
} catch (error) {
  failure = error;
} finally {
  const cleanupErrors = [];
  const cleanup = async (label, action) => {
    try {
      await action();
    } catch {
      cleanupErrors.push(new Error(`Smoke cleanup failed: ${label}.`));
    }
  };
  // Extra containers must detach before Compose can remove its default network.
  for (const id of extraContainers) {
    await cleanup(id, async () => {
      const exists = await docker(['ps', '-aq', '--filter', `name=^/${id}$`]);
      if (!exists) return;
      await docker(['stop', '--time', '10', id]);
      await docker(['rm', id]);
    });
  }
  await cleanup('Compose stack', () =>
    docker([...compose, 'down', '--remove-orphans']),
  );
  await cleanup('resource absence verification', async () => {
    for (const label of [
      `com.docker.compose.project=${project}`,
      `com.wps.smoke-project=${project}`,
    ]) {
      assert.equal(
        await docker(['ps', '-aq', '--filter', `label=${label}`]),
        '',
      );
      assert.equal(
        await docker(['network', 'ls', '-q', '--filter', `label=${label}`]),
        '',
      );
    }
  });
  for (const file of sentinelFiles) await cleanup(file, () => unlink(file));
  await cleanup('temporary audit directory', () =>
    rm(temporary, { recursive: true, force: true }),
  );
  if (cleanupErrors.length)
    failure = new AggregateError(
      failure ? [failure, ...cleanupErrors] : cleanupErrors,
      'Container smoke cleanup failed.',
    );
}
if (failure) throw failure;
console.log(
  'Container smoke passed: production builds, runtime routing, non-root/read-only/private API, demo scenarios, health/outage, CSP/no-store, spoof-resistant shared quota, retry headers, redaction, startup validation, SIGTERM and verified container/network cleanup.',
);
