import { build } from 'esbuild'

// One file per entry, for Node 22. Native modules and fastify's own
// plugins stay in node_modules.
await build({
  entryPoints: { index: 'server/src/index.ts', cli: 'server/src/cli.ts' },
  outdir: 'dist/server',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
})
