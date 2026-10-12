import { mkdir, copyFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const target = resolve('browser/public/ocr');
await mkdir(target, { recursive: true });
await copyFile(
  'node_modules/tesseract.js/dist/worker.min.js',
  `${target}/worker.min.js`,
);
for (const f of await readdir('node_modules/tesseract.js-core')) {
  if (/^tesseract-core.*\.(wasm|js)$/.test(f))
    await copyFile(`node_modules/tesseract.js-core/${f}`, `${target}/${f}`);
}
await copyFile(
  'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
  `${target}/eng.traineddata.gz`,
);
const licenses = resolve('browser/public/licenses');
await mkdir(licenses, { recursive: true });
for (const [src, name] of [
  ['node_modules/three/LICENSE', 'three.txt'],
  ['node_modules/tesseract.js/LICENSE.md', 'tesseract-js.txt'],
  ['node_modules/tesseract.js-core/LICENSE', 'tesseract-core.txt'],
  ['browser/third-party/tessdata-LICENSE', 'tessdata.txt'],
])
  await copyFile(src, `${licenses}/${name}`);
console.log('Local OCR worker, WASM, and English model prepared.');
