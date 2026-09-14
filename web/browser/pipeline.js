import { analyze, amplitudeHistogram } from './signal.js';
import { derive } from './montage.js';
import { transientFeatures } from './patterns.js';
import { waveformSnapshot } from './waveform.js';
import { deltaRhythm, bluntRepetition } from './visual-patterns.js';
export class FeaturePipeline {
  constructor(onFrame) {
    this.onFrame = onFrame;
    this.reset();
  }
  reset() {
    this.buffer = new Map();
    this.pixelQuality = new Map();
    this.since = 0;
    this.lastEnd = null;
    this.segment = null;
    this.rate = null;
    this.sharpSeen = new Map();
  }
  gap(start, end, settings, segment, source, screenRedraw = false) {
    this.reset();
    if (end > start)
      this.onFrame({
        start,
        end,
        settings,
        segment,
        source,
        gaps: end - start,
        channels: [],
        leaves: 1,
        ...(screenRedraw ? { screenRedraw: true } : {}),
      });
  }
  ingest(
    block,
    { settings = {}, segment = '0', source = 'screen', expected = [], flush = false } = {},
  ) {
    if (this.segment !== segment || this.rate !== block.rate) {
      this.reset();
      this.segment = segment;
      this.rate = block.rate;
    }
    const count = block.channels[0].samples.length,
      rate = block.rate;
    for (const c of block.channels) {
      const old = this.buffer.get(c.name) || [];
      this.buffer.set(
        c.name,
        [
          ...old,
          ...Array.from(c.samples, (x, i) =>
            (c.valid === false && !c.clippedPixels) || (c.observed && c.observed[i] === 0)
              ? NaN
              : x,
          ),
        ].slice(-Math.ceil(rate * 6)),
      );
      if (c.clippedPixels)
        this.pixelQuality.set(
          c.name,
          [...(this.pixelQuality.get(c.name) || []), ...c.observed].slice(-Math.ceil(rate * 6)),
        );
    }
    this.since += count;
    if (
      (!flush && this.since < rate * 0.5) ||
      Math.min(...[...this.buffer.values()].map((s) => s.length)) < rate * 2
    )
      return;
    const end = block.start + block.duration,
      start = this.lastEnd ?? Math.max(0, end - this.since / rate);
    this.lastEnd = end;
    this.since = 0;
    const observed = block.channels.map((c) => {
      const samples = Float32Array.from(this.buffer.get(c.name).slice(-Math.ceil(rate * 2)));
      const pixels = this.pixelQuality.get(c.name)?.slice(-samples.length);
      // Quality belongs to the complete analysis window. A short display
      // redraw containing one repaired pixel must not discard all its other
      // observed samples. True gaps and clipping remain NaNs and fail analysis.
      const reconstructed = pixels ? pixels.filter((p) => p === 2).length / pixels.length : 0;
      return {
        ...c,
        segment,
        start: end - 2,
        rate,
        samples,
        status: 'observed',
        ...(pixels ? { valid: reconstructed < 0.05, reconstructed } : {}),
      };
    });
    const rows = [...observed];
    for (const name of expected) {
      if (rows.some((c) => c.name === name)) continue;
      const d = derive(name, observed);
      rows.push(d || { name, status: 'expected', valid: false, samples: [] });
    }
    const channels = rows.map((c) => {
      const f =
        c.valid === false ? { valid: false, bands: [] } : analyze(c.samples, rate, settings);
      const transients =
        f.valid && c.status === 'observed'
          ? transientFeatures(c.samples, rate, c.start)
          : { available: false, events: [] };
      const priorSharp = this.sharpSeen.get(c.name) ?? -Infinity;
      const newSharp = transients.events.filter((e) => e.time > priorSharp + 0.09);
      if (newSharp.length) this.sharpSeen.set(c.name, newSharp.at(-1).time);
      return {
        name: c.name,
        labelInferred: c.labelInferred === true,
        status: c.status,
        from: c.from,
        ...f,
        visual:
          f.valid && c.status === 'observed'
            ? {
                delta: deltaRhythm(this.buffer.get(c.name), rate, end),
                blunt: bluntRepetition(
                  this.buffer.get(c.name),
                  rate,
                  end - this.buffer.get(c.name).length / rate,
                ),
              }
            : null,
        transients,
        sharpCount: newSharp.length,
        sharpValidSeconds: transients.available ? end - start : 0,
        quality: c.quality ?? 1,
        validSeconds: f.valid ? end - start : 0,
        amplitudeHistogram: f.valid ? amplitudeHistogram(f.bands, end - start) : null,
      };
    });
    if (end > start)
      this.onFrame({
        start,
        end,
        settings,
        segment,
        source,
        channels,
        // Screen voltages already reference the confirmed row baseline. A new
        // rolling-window mean would shift the same sample at each update.
        waveform: waveformSnapshot(rows, channels, end - 2, rate, { center: source !== 'screen' }),
        gaps: 0,
        leaves: 1,
        rate,
      });
  }
}
