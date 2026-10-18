// build.mjs — makes src/index.html work with NO internet.
// Every external <script src> and Google-Fonts <link> in src/index.html is downloaded
// (at build time, on GitHub's servers) and pasted INTO the page, so the finished file is fully self-contained.
// Output: www/index.html   (used by the APK and by GitHub Pages)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const SRC = 'src/index.html';
const OUT = 'www/index.html';
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

async function get(url, asBuffer = false) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return asBuffer ? Buffer.from(await r.arrayBuffer()) : await r.text();
}

let html = readFileSync(SRC, 'utf8');

// 1) <script src="https://..."></script>  ->  <script>/* url */ ...code... </script>
const scriptRe = /<script\s+src="(https:\/\/[^"]+)"[^>]*>\s*<\/script>/g;
for (const m of [...html.matchAll(scriptRe)]) {
  const [tag, url] = m;
  let code = await get(url);
  code = code.replace(/<\/script/gi, '<\\/script');
  console.log('inlined script', url, code.length);
  html = html.replace(tag, () => `<script>/* ${url} */\n${code}\n</script>`);
}

// 2) Google Fonts stylesheet -> inline CSS with the font files embedded as base64
const linkRe = /<link\s+rel="stylesheet"\s+href="(https:\/\/fonts\.googleapis\.com\/[^"]+)"\s*>/g;
for (const m of [...html.matchAll(linkRe)]) {
  const [tag, url] = m;
  let css = await get(url);
  for (const u of new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((x) => x[1]))) {
    const b64 = (await get(u, true)).toString('base64');
    css = css.split(u).join(`data:font/woff2;base64,${b64}`);
  }
  console.log('inlined font css', url, css.length);
  html = html.replace(tag, () => `<style>${css}</style>`);
}
// the preconnect hint is useless offline
html = html.replace(/<link rel="preconnect"[^>]*>\s*/g, '');

// 3) safety check: nothing may still be loaded from the internet
const left = [...html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="https?:\/\/[^"]+"/g)].map((x) => x[0].slice(0, 120));
if (left.length) { console.error('STILL EXTERNAL:\n' + left.join('\n')); process.exit(1); }
if (/url\(https?:\/\//.test(html)) { console.error('STILL EXTERNAL: css url(http...)'); process.exit(1); }

mkdirSync('www', { recursive: true });
writeFileSync(OUT, html);
console.log('OK ->', OUT, (html.length / 1024).toFixed(0) + ' KB');
