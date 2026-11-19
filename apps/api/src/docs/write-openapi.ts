import { mkdir, writeFile } from 'node:fs/promises';
import { generateOpenApi } from './openapi.js';

const destination = new URL(
  '../../../../docs/api/openapi.json',
  import.meta.url,
);
await mkdir(new URL('./', destination), { recursive: true });
await writeFile(destination, JSON.stringify(generateOpenApi(), null, 2) + '\n');
