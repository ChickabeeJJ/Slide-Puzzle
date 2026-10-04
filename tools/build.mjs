// Production build: game/ (source) -> dist/ (optimised) -> release zip.
//  - JS: all ES modules bundled + minified into one file (no module waterfall).
//  - CSS: minified and inlined into index.html (one less render-blocking request).
//  - Fonts: both weights preloaded so text never flashes late.
//  - JS is preloaded right after the CrazyGames SDK tag so both download in parallel.
// Usage: npm run build
import { build, transform } from 'esbuild';
import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync, statSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'game');
const OUT = path.join(ROOT, 'dist');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, 'js'), { recursive: true });

await build({
  entryPoints: [path.join(SRC, 'js/main.js')],
  bundle: true,
  minify: true,
  format: 'esm',
  target: ['es2020', 'safari14'],
  outfile: path.join(OUT, 'js/game.js'),
  legalComments: 'none',
});

const css = (await transform(readFileSync(path.join(SRC, 'css/style.css'), 'utf8'), { loader: 'css', minify: true })).code
  .replaceAll('../assets/', 'assets/');
cpSync(path.join(SRC, 'assets'), path.join(OUT, 'assets'), { recursive: true });

let html = readFileSync(path.join(SRC, 'index.html'), 'utf8');
html = html
  .replace(/\s*<link rel="preload" href="assets\/fonts[^>]*>/g, '')
  .replace('<link rel="stylesheet" href="css/style.css" />', `<style>${css.trim()}</style>`)
  .replace(
    '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>',
    `<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>
    <link rel="modulepreload" href="js/game.js" />
    <link rel="preload" href="assets/fonts/fredoka-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="assets/fonts/fredoka-latin-600-normal.woff2" as="font" type="font/woff2" crossorigin />`,
  )
  .replace('<script type="module" src="js/main.js"></script>', '<script type="module" src="js/game.js"></script>')
  .replace(/\n\s*<!--[^]*?-->/g, '')
  .replace(/>\s+</g, '><');
writeFileSync(path.join(OUT, 'index.html'), html);

const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = path.join(d, f);
    statSync(p).isDirectory() ? walk(p) : files.push(p);
  }
})(OUT);
const total = files.reduce((n, f) => n + statSync(f).size, 0);
console.log(`dist/: ${files.length} files, ${(total / 1024).toFixed(1)} KB`);

// Upload package for CrazyGames (index.html at the zip root).
try {
  mkdirSync(path.join(ROOT, 'release'), { recursive: true });
  const zip = path.join(ROOT, 'release/slide-and-paint-crazygames.zip');
  rmSync(zip, { force: true });
  execSync(`zip -r -9 -X "${zip}" . -x '.*'`, { cwd: OUT, stdio: 'ignore' });
  console.log(`release zip: ${(statSync(zip).size / 1024).toFixed(1)} KB`);
} catch {
  console.log('zip not available; skipped release package');
}
