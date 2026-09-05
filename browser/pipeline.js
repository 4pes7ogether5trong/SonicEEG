import { analyze, amplitudeHistogram } from './signal.js';
import { derive } from './montage.js';
export class FeaturePipeline {
  constructor(onFrame) {
    this.onFrame = onFrame;
    this.reset();
  }
  reset() {
    this.buffer = new Map();
    this.since = 0;
    this.lastEnd = null;
    this.segment = null;
    this.rate = null;
  }
  gap(start, end, settings, segment, source) {
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
      });
  }
  ingest(
    block,
    { settings = {}, segment = '0', source = 'screen', expected = [] } = {},
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
            c.valid === false || (c.observed && c.observed[i] === 0) ? NaN : x,
          ),
        ].slice(-Math.ceil(rate * 2)),
      );
    }
    this.since += count;
    if (
      this.since < rate * 0.5 ||
      Math.min(...[...this.buffer.values()].map((s) => s.length)) < rate * 2
    )
      return;
    const end = block.start + block.duration,
      start = this.lastEnd ?? Math.max(0, end - this.since / rate);
    this.lastEnd = end;
    this.since = 0;
    const observed = block.channels.map((c) => ({
      ...c,
      segment,
      start: end - 2,
      rate,
      samples: Float32Array.from(this.buffer.get(c.name)),
      status: 'observed',
    }));
    const rows = [...observed];
    for (const name of expected) {
      if (rows.some((c) => c.name === name)) continue;
      const d = derive(name, observed);
      rows.push(d || { name, status: 'expected', valid: false, samples: [] });
    }
    const channels = rows.map((c) => {
      const f =
        c.valid === false
          ? { valid: false, bands: [] }
          : analyze(c.samples, rate, settings);
      return {
        name: c.name,
        status: c.status,
        from: c.from,
        ...f,
        quality: c.quality ?? 1,
        validSeconds: f.valid ? end - start : 0,
        amplitudeHistogram: f.valid
          ? amplitudeHistogram(f.bands, end - start)
          : null,
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
        gaps: 0,
        leaves: 1,
        rate,
      });
  }
}
