# SonicEEG web release

Browser application recovered from SonicEEG version 24 on September 14, 2026. Runtime base: c5ba25e42cb2c6d2be1be63065c5dc47c1e2e9f5.

Build: `npm ci` then `npm run build`. `dist/` contains the public website. JavaScript, signal processing, audio synthesis, and OCR run in the browser; no OpenAI service is required for application execution. Browser screen-capture and audio permissions still apply.

Only application source is included here. Patient recordings, capture fixtures, development reports, credentials and the single-file offline packaging are not included.
