import { defineConfig } from 'vite';
export default defineConfig({
  root: 'browser',
  base: './',
  build: { outDir: '../dist', emptyOutDir: true, target: 'es2022' },
  worker: { format: 'es' },
  server: { host: '0.0.0.0', allowedHosts: ['terminal.local'] },
});
