import { fork } from 'node:child_process';
import { once } from 'node:events';
import { join } from 'node:path';
import { test as base, expect } from '@playwright/test';

type Scenario = 'zero' | 'partial-metadata' | 'provider-failure' | 'cancel';
type Event = {
  type: string;
  inFlight?: number;
  origin?: string;
  target?: string;
};
export const test = base.extend<{
  scenario: Scenario;
  backend: {
    origin: string;
    target: string;
    events: Event[];
    state(): Promise<number>;
  };
}>({
  scenario: ['zero', { option: true }],
  backend: async ({ scenario }, use) => {
    const child = fork(join(__dirname, 'scenario-server.mjs'), [scenario], {
      execArgv: [],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    const events: Event[] = [];
    let output = '';
    child.stdout?.on('data', (data) => {
      output += String(data);
    });
    child.stderr?.on('data', (data) => {
      output += String(data);
    });
    child.on('message', (event: Event) => events.push(event));
    try {
      const ready = await new Promise<Event>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`Fixture startup timed out: ${output}`)),
          25_000,
        );
        child.on('message', (event: Event) => {
          if (event.type === 'ready') {
            clearTimeout(timer);
            resolve(event);
          }
        });
        child.once('exit', () => {
          clearTimeout(timer);
          reject(new Error(`Fixture process exited: ${output}`));
        });
        child.once('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
      });
      await use({
        origin: ready.origin!,
        target: ready.target!,
        events,
        async state() {
          const result = once(child, 'message');
          child.send('state');
          const [event] = (await result) as [Event];
          expect(event.type).toBe('state');
          return event.inFlight!;
        },
      });
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        const closed = once(child, 'close');
        child.kill('SIGTERM');
        const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
        await closed;
        clearTimeout(timer);
      }
    }
  },
});
export { expect };
