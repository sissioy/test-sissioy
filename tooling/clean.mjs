import { rm } from 'node:fs/promises';

await Promise.all([
  rm('.build', { recursive: true, force: true }),
  rm('dist', { recursive: true, force: true })
]);
