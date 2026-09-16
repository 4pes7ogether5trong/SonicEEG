import { defineConfig } from 'vite';
export default defineConfig({
  root: 'browser',
  base: './',
  server: { host: '0.0.0.0', allowedHosts: ['terminal.local'] },
  build: { outDir: '../dist', emptyOutDir: true, target: 'es2022' },
  worker: { format: 'es' },
});
