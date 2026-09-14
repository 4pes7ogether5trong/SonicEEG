import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
await build({
  entryPoints: ['eeg_visualizer_mvp/web/app.js'],
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2022',
  outfile: 'eeg_visualizer_mvp/web/bundle.js',
  legalComments: 'linked',
});
await mkdir('dist/analysis-v2', { recursive: true });
for (const file of ['index.html', 'styles.css', 'bundle.js', 'bundle.js.LEGAL.txt']) {
  await copyFile(`eeg_visualizer_mvp/web/${file}`, `dist/analysis-v2/${file}`).catch((error) => {
    if (!file.endsWith('.LEGAL.txt')) throw error;
  });
}
const index = await readFile('dist/index.html', 'utf8');
await writeFile('dist/index.html', index.replace('<footer>', '<footer><a href="./analysis-v2/">Earlier waveform workspace</a>'));
