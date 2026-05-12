const esbuild = require('esbuild');
const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

const ctx = esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: !isProduction,
  minify: isProduction,
  logLevel: 'info',
});

ctx.then(c => isWatch ? c.watch() : c.rebuild().then(() => c.dispose()));
