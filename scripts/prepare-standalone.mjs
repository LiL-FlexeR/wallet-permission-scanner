import { cp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const web = fileURLToPath(new URL('../apps/web/', import.meta.url));
const output = `${web}.next/standalone/apps/web`;
const source = await readFile(`${web}src/server/environment.ts`, 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
});
await writeFile(`${output}/runtime-environment.js`, outputText);
await cp(`${web}start-standalone.mjs`, `${output}/start-standalone.mjs`);
// The framework bundles Zod internally; tracing cannot see this separate validator.
await cp(`${web}node_modules/zod`, `${output}/node_modules/zod`, {
  recursive: true,
  dereference: true,
});
await cp(`${web}.next/static`, `${output}/.next/static`, { recursive: true });
