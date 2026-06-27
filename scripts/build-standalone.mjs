// =====================================================================
// scripts/build-standalone.mjs
//
// Produces a single self-contained HTML file that runs straight from the
// filesystem (double-click, no server) by inlining the stylesheet and a
// bundled, module-free build of the game into index.html.
//
//   node scripts/build-standalone.mjs   →   dist/realms-of-iron.html
// =====================================================================

import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

// 1. Bundle the ES-module graph down to one IIFE (no imports → no CORS).
const result = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  minify: true,
  write: false,
});
let js = result.outputFiles[0].text;
// Guard against any literal </script> inside the bundle closing the tag early.
js = js.replace(/<\/script>/gi, '<\\/script>');

// 2. Read the shell + styles.
const css = readFileSync('styles/game.css', 'utf8');
let html = readFileSync('index.html', 'utf8');

// 3. Inline CSS (replace the <link>) and JS (replace the module <script>).
html = html.replace(
  /<link rel="stylesheet" href="styles\/game\.css">/,
  `<style>\n${css}\n</style>`
);
html = html.replace(
  /<script type="module" src="src\/main\.js"><\/script>/,
  `<script>\n${js}\n</script>`
);

mkdirSync('dist', { recursive: true });
writeFileSync('dist/realms-of-iron.html', html);
console.log('Wrote dist/realms-of-iron.html (' + Math.round(html.length / 1024) + ' kb)');
