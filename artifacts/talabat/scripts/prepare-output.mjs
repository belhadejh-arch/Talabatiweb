import { access, cp, mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Vercel may use either the repository or this package as its Root Directory.
// Keep dist/public relative to both roots without moving the artifact's output.
const repositoryOutput = fileURLToPath(new URL('../../../dist/public/', import.meta.url));
const packageOutput = fileURLToPath(new URL('../dist/public/', import.meta.url));

await access(fileURLToPath(new URL('../../../dist/public/index.html', import.meta.url)));
await rm(packageOutput, { recursive: true, force: true });
await mkdir(dirname(packageOutput), { recursive: true });
await cp(repositoryOutput, packageOutput, { recursive: true });
console.log('Prepared dist/public for both Vercel Root Directory settings.');