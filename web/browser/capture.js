import { createWorker, PSM } from 'tesseract.js';
import { parseSettings } from './montage.js';
import { recognizeLabelImage, labelPixels, locateLabelGeometry } from './ocr-labels.js';
import { capturePixelRect, nativeCaptureRect } from './capture-layout.js';
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
      video: { frameRate: { ideal: 8, max: 12 }, resizeMode: { ideal: 'none' } },
      audio: false,
    });
    if (version !== this.version) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error('Capture selection was cancelled.');
    }
    this.stream = stream;
    const track = stream.getVideoTracks()[0];
    if ('contentHint' in track) track.contentHint = 'text';
    this.video.srcObject = this.stream;
    await this.video.play();
    track.addEventListener('ended', onEnd, { once: true });
  }
  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.version++;
    this.ocrQueue = null;
    const pending = this.workerPromise;
    this.workerPromise = null;
    if (pending) pending.then((w) => w.terminate()).catch(() => {});
  }
  crop(rect) {
    const width = this.video.videoWidth,
      height = this.video.videoHeight;
    if (!width || !height) throw new Error('Capture is not ready');
    const c = document.createElement('canvas');
    const p = capturePixelRect(rect, [width, height]);
    c.width = p.w;
    c.height = p.h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.video, p.x, p.y, p.w, p.h, 0, 0, c.width, c.height);
    return c;
  }
  dimensions() {
    return [this.video.videoWidth, this.video.videoHeight];
  }
  locateRows(rect, options) {
    const canvas = this.crop(rect);
    try {
      return locateLabelGeometry(
        canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height),
        options,
      );
    } finally {
      canvas.width = canvas.height = 0;
    }
  }
  async ocrWorker() {
    if (!this.workerPromise) {
      const base = new URL('./ocr/', document.baseURI).href;
      const pending = createWorker('eng', 1, {
        workerPath: base + 'worker.min.js',
        corePath: base,
        langPath: base.replace(/\/$/, ''),
        gzip: true,
        workerBlobURL: false,
        cacheMethod: 'none',
        logger: () => {},
        errorHandler: () => {},
      }).catch((e) => {
        if (this.workerPromise === pending) this.workerPromise = null;
        throw new Error('Local text recognition could not load. Enter derivations manually.');
      });
      this.workerPromise = pending;
    }
    return this.workerPromise;
  }
  queueOCR(job) {
    const version = this.version;
    const run = async () => {
      if (version !== this.version) throw new Error('Text recognition was cancelled.');
      let timeout;
      try {
        return await Promise.race([
          job(),
          new Promise((_, reject) => {
            timeout = setTimeout(() => {
              if (version === this.version) {
                const pending = this.workerPromise;
                this.workerPromise = null;
                if (pending) pending.then((w) => w.terminate()).catch(() => {});
              }
              reject(
                new Error(
                  'Text recognition took too long. Enter the names and adjust the label box, or read again.',
                ),
              );
            }, 25000);
          }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
    };
    const pending = (this.ocrQueue || Promise.resolve()).then(run, run);
    this.ocrQueue = pending.catch(() => {});
    return pending;
  }
  recognize(labelRect, settingsRect, options = {}) {
    return this.queueOCR(() => this.recognizeRegions(labelRect, settingsRect, options));
  }
  async recognizeRegions(labelRect, settingsRect, { inspect = false } = {}) {
    const worker = await this.ocrWorker();
    const rect = nativeCaptureRect(labelRect, this.dimensions());
    const source = this.crop(rect);
    const image = source
      .getContext('2d', { willReadFrequently: true })
      .getImageData(0, 0, source.width, source.height);
    const combined =
      settingsRect && ['x', 'y', 'w', 'h'].every((key) => labelRect[key] === settingsRect[key]);
    try {
      const result = await recognizeLabelImage(
        image,
        async (pixels, mode, options = {}) => {
          await worker.setParameters({
            tessedit_pageseg_mode: mode,
            tessedit_char_whitelist: options.uppercase
              ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-+ '
              : 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-+ ',
          });
          const c = document.createElement('canvas');
          c.width = pixels.width;
          c.height = pixels.height;
          c.getContext('2d').putImageData(
            new ImageData(pixels.data, pixels.width, pixels.height),
            0,
            0,
          );
          try {
            return (await worker.recognize(c, {}, { blocks: true, text: true })).data;
          } finally {
            c.width = c.height = 0;
          }
        },
        { combined },
      );
      const settings = await this.recognizeSettings(settingsRect, worker);
      let preview = null;
      if (inspect && result.column) {
        const p = labelPixels(
          image,
          { ...result.column, top: 0, bottom: image.height },
          { scale: 1, padding: 0 },
        );
        const original = source.getContext('2d').getImageData(p.left, 0, p.width, p.height);
        preview = { width: p.width, height: p.height, original: original.data, contrast: p.data };
      }
      return { ...result, settings, rect, imageSize: [image.width, image.height], preview };
    } finally {
      source.width = source.height = 0;
    }
  }
  settings(rect) {
    if (!rect) return Promise.resolve(null);
    return this.queueOCR(() => this.recognizeSettings(rect));
  }
  async recognizeSettings(rect, worker = null) {
    if (!rect) return null;
    worker ??= await this.ocrWorker();
    await worker.setParameters({
      tessedit_char_whitelist: '',
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    });
    const c = this.crop(rect);
    const { data } = await worker.recognize(c);
    c.width = 0;
    c.height = 0;
    return parseSettings(data.text);
  }
}
