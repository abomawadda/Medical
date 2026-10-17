import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist');
// Publish only application assets; keep spreadsheets, reports and tooling out.
const assets = ['index.html', 'manifest.json', 'sw.js', 'css', 'js', 'img'];

// Validate inputs before replacing a previous build.
for (const asset of assets) await stat(resolve(root, asset));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const asset of assets) {
  await cp(resolve(root, asset), resolve(output, asset), { recursive: true });
}
console.log('Medical static site built in dist/; no dependencies required.');
