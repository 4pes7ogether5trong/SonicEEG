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
    this.inputEnd = null;
    this.layout = null;
  }
  gap(start, end, settings, segment, source, screenRedraw = false) {
    // A verified sweep wrap with no missing columns is continuous EEG.
    // Resetting here threw away two seconds of analysis after every page.
    if (!(end > start + 1e-7)) return;
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
    const layout = block.channels.map((c) => c.name).join('|');
    if (this.segment !== segment || this.rate !== block.rate || this.layout !== layout) {
      this.reset();
      this.segment = segment;
      this.rate = block.rate;
      this.layout = layout;
    }
    const count = block.channels[0]?.samples.length || 0;
    if (!count || !(block.rate > 0) || block.channels.some((c) => c.samples.length !== count))
      return;
    if (this.inputEnd != null && block.start < this.inputEnd - 1e-6) return;
    if (this.inputEnd != null && block.start > this.inputEnd + 1e-6) {
      this.gap(this.lastEnd ?? this.inputEnd, block.start, settings, segment, source);
      this.segment = segment;
      this.rate = block.rate;
      this.layout = layout;
    }
    const metadata = { settings, segment, source, expected };
    // Evaluate at a source-sample cadence, independent of video/worker arrival
    // sizes. A later bad column must not erase an earlier complete window in
    // the same batch; large updates must not silently skip usable intervals.
    let from = 0;
    while (from < count) {
      const available = this.buffer.get(block.channels[0].name)?.length || 0;
      const until =
        available < Math.ceil(block.rate * 2)
          ? Math.ceil(block.rate * 2) - available
          : Math.max(1, Math.ceil(block.rate * 0.5) - this.since);
      const to = Math.min(count, from + until);
      const part = {
        ...block,
        start: block.start + from / block.rate,
        duration: (to - from) / block.rate,
        channels: block.channels.map((c) => ({
          ...c,
          samples: c.samples.slice(from, to),
          observed: c.observed?.slice(from, to),
          clippedPixels: c.clippedPixels?.slice(from, to),
        })),
      };
      this.ingestChunk(part, { ...metadata, flush: flush && to === count });
      from = to;
    }
    this.inputEnd = block.start + count / block.rate;
  }
  ingestChunk(block, { settings, segment, source, expected, flush }) {
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
        start: end - samples.length / rate,
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
      let missing = 0,
        run = 0,
        longest = 0;
      for (const value of c.samples) {
        if (!Number.isFinite(value)) {
          missing++;
          run = 0;
        } else {
          run++;
          longest = Math.max(longest, run);
        }
      }
      const analysis = {
        reason: f.valid
          ? 'ready'
          : missing
            ? 'missing'
            : c.reconstructed >= 0.05
              ? 'repairs'
              : 'quality',
        missingFraction: c.samples.length ? missing / c.samples.length : 1,
        contiguousSeconds: longest / rate,
        repairedFraction: c.reconstructed || 0,
      };
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
        analysis,
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
        waveform: waveformSnapshot(rows, channels, end - Math.ceil(rate * 2) / rate, rate, {
          center: source !== 'screen',
        }),
        gaps: 0,
        leaves: 1,
        rate,
      });
  }
}
