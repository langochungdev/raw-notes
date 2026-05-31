const esbuild = require('esbuild');
const path = require('path');

async function main() {
  await esbuild.build({
    entryPoints: [path.join(__dirname, '..', 'sidepanel', 'milkdown_entry.js')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2022'],
    outfile: path.join(__dirname, '..', 'vendor', 'milkdown.bundle.js'),
    logLevel: 'info',
    sourcemap: false,
    minify: false
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
