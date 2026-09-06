import { createWorker, PSM } from 'tesseract.js';
import { labelCandidates, parseSettings } from './montage.js';
export class BrowserCapture {
  constructor() {
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;
    this.version = 0;
  }
  async start(onEnd) {
    if (!navigator.mediaDevices?.getDisplayMedia)
      throw new Error(
        'This browser cannot capture an application window. Try an approved desktop browser.',
      );
    const version = ++this.version;
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 8, max: 12 } },
      audio: false,
    });
    if (version !== this.version) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error('Capture selection was cancelled.');
    }
    this.stream = stream;
    this.video.srcObject = this.stream;
    await this.video.play();
    this.stream
      .getVideoTracks()[0]
      .addEventListener('ended', onEnd, { once: true });
  }
  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.version++;
    const pending = this.workerPromise;
    this.workerPromise = null;
    if (pending) pending.then((w) => w.terminate()).catch(() => {});
  }
  crop(rect) {
    const width = this.video.videoWidth,
      height = this.video.videoHeight;
    if (!width || !height) throw new Error('Capture is not ready');
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(rect.w * width));
    c.height = Math.max(1, Math.round(rect.h * height));
    c.getContext('2d', { willReadFrequently: true }).drawImage(
      this.video,
      rect.x * width,
      rect.y * height,
      rect.w * width,
      rect.h * height,
      0,
      0,
      c.width,
      c.height,
    );
    return c;
  }
  dimensions() {
    return [this.video.videoWidth, this.video.videoHeight];
  }
  async ocrWorker() {
    if (!this.workerPromise) {
      const base = new URL('./ocr/', document.baseURI).href;
      this.workerPromise = createWorker('eng', 1, {
        workerPath: base + 'worker.min.js',
        corePath: base,
        langPath: base.replace(/\/$/, ''),
        gzip: true,
        workerBlobURL: false,
        cacheMethod: 'none',
        logger: () => {},
        errorHandler: () => {},
      }).catch((e) => {
        this.workerPromise = null;
        throw new Error(
          'Local text recognition could not load. Enter derivations manually.',
        );
      });
    }
    return this.workerPromise;
  }
  async recognize(labelRect, settingsRect) {
    const worker = await this.ocrWorker();
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      tessedit_char_whitelist:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-+ ',
    });
    const c = this.crop(labelRect),
      r = await worker.recognize(c, {}, { blocks: true, text: true });
    const rows = [];
    for (const block of r.data.blocks || [])
      for (const para of block.paragraphs || [])
        for (const line of para.lines || []) {
          const found = labelCandidates(
            line.text || line.words?.map((w) => w.text).join(' ') || '',
          );
          if (found.length === 1)
            rows.push({
              name: found[0].name,
              corrected: found[0].corrected,
              y: (line.bbox.y0 + line.bbox.y1) / 2 / c.height,
              confidence: line.confidence ?? r.data.confidence,
            });
        }
    if (!rows.length) {
      const names = labelCandidates(r.data.text);
      names.forEach((d, i) =>
        rows.push({
          name: d.name,
          corrected: d.corrected,
          y: (i + 0.5) / names.length,
          confidence: 0,
        }),
      );
    }
    c.width = 0;
    c.height = 0;
    const settings = await this.settings(settingsRect, worker);
    return { rows: rows.sort((a, b) => a.y - b.y), settings };
  }
  async settings(rect, worker = null) {
    if (!rect) return null;
    worker ??= await this.ocrWorker();
    await worker.setParameters({ tessedit_char_whitelist: '' });
    const c = this.crop(rect);
    const { data } = await worker.recognize(c);
    c.width = 0;
    c.height = 0;
    return parseSettings(data.text);
  }
}
