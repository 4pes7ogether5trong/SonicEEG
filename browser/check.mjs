import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const html = await readFile('browser/index.html', 'utf8'),
  app = await readFile('browser/app.js', 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
if (new Set(ids).size !== ids.length) throw new Error('Duplicate HTML IDs');
for (const m of app.matchAll(/\$\('([^']+)'\)/g))
  if (!ids.includes(m[1])) throw new Error(`Missing element ${m[1]}`);
for (const f of await readdir('browser'))
  if (/\.(js|mjs)$/.test(f))
    execFileSync(process.execPath, ['--check', `browser/${f}`]);
for (const f of await readdir('browser'))
  if (f.endsWith('.js')) {
    const source = await readFile(`browser/${f}`, 'utf8');
    if (
      /https?:\/\/|sendBeacon\(|XMLHttpRequest|new WebSocket|fetch\(/.test(
        source,
      )
    )
      throw new Error(`Unexpected network endpoint/API in ${f}`);
  }
if (!html.includes("connect-src 'self'"))
  throw new Error('Missing network policy');
console.log(
  'Module syntax, UI references, and application network-API audit passed.',
);
