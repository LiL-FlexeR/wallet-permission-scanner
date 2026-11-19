// Standalone server.js bypasses next.config.ts. Validate before importing it.
import { validateWebEnvironment } from './runtime-environment.js';

try {
  validateWebEnvironment(process.env);
} catch {
  console.error('Invalid web configuration: API_PROXY_TARGET.');
  process.exit(1);
}
await import('./server.js');
