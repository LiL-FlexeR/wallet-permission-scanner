import 'server-only';
import { validateWebEnvironment } from './environment';
import type { WebEnvironment } from './environment';

let config: WebEnvironment | undefined;

export function getWebEnvironment(): WebEnvironment {
  config ??= validateWebEnvironment(process.env);
  return config;
}
