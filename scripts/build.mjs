import { build } from 'esbuild';
import fs from 'node:fs/promises';
await fs.mkdir('lib', { recursive: true });
await build({ entryPoints: ['src/index.ts'], outfile: 'lib/index.js', bundle: true, platform: 'node', target: 'node22', format: 'esm',
  external: ['@deepseek-ai/*', 'ws'], sourcemap: true });
await build({ entryPoints: ['src/client/index.tsx'], outfile: 'lib/client.js', bundle: true, platform: 'browser', target: 'chrome116', format: 'cjs',
  external: ['react', 'react/jsx-runtime', 'react-dom'],
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: 'window.__ModuleLoader__.load({id:"tiehua-dsh-browser",factory:(require)=>{var module={exports:{}};var exports=module.exports;' },
  footer: { js: 'return module.exports;}});' }, sourcemap: true });
console.log('Built DSH native host plugin and settings UI.');
