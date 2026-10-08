import test from 'node:test';
import assert from 'node:assert/strict';
import { FeaturePipeline } from '../pipeline.js';

function block(start, duration, missingAt = -1) {
  const rate = 128,
    count = Math.round(duration * rate);
  const samples = Float32Array.from(
    { length: count },
    (_, i) => 20 * Math.sin(2 * Math.PI * 10 * (start + i / rate)),
  );
  const observed = new Uint8Array(count).fill(1);
  if (missingAt >= start && missingAt < start + duration) {
    const index = Math.round((missingAt - start) * rate);
    observed[index] = 0;
    samples[index] = NaN;
  }
  return {
    start,
    duration,
    rate,
    channels: [
      { name: 'F7-T7', samples, observed, clippedPixels: new Uint8Array(count), valid: true },
    ],
  };
}

test('A zero-duration verified sweep boundary preserves analysis, while actual missing time resets it', () => {
  const frames = [],
    p = new FeaturePipeline((f) => frames.push(f));
  p.ingest(block(0, 2));
  p.gap(2, 2, {}, '0', 'screen', true);
  p.ingest(block(2, 0.5));
  assert.equal(frames.at(-1).end, 2.5);
  assert.equal(frames.at(-1).channels[0].valid, true);
  p.gap(2.5, 2.75, {}, '0', 'screen', true);
  p.ingest(block(2.75, 1.5));
  assert.equal(frames.at(-1).gaps, 0.25);
  p.ingest(block(4.25, 0.5));
  assert.equal(frames.at(-1).end, 4.75);
  assert.equal(frames.at(-1).waveform.start, 2.75);
});

test('Identical EEG has identical analyzed windows under uniform, jittery and large video batches', () => {
  function replay(chunks) {
    let start = 0;
    const frames = [],
      p = new FeaturePipeline((f) => frames.push(f));
    for (const duration of chunks) {
      p.ingest(block(start, duration, 3.75));
      start += duration;
    }
    return frames.map((f) => ({
      start: f.start,
      end: f.end,
      valid: f.channels[0].valid,
      bands: f.channels[0].bands,
      missing: f.channels[0].analysis.missingFraction,
    }));
  }
  const expected = replay(Array(16).fill(0.5));
  assert.deepEqual(replay([1.25, 0.25, 2.5, 0.125, 1.875, 2]), expected);
  assert.deepEqual(replay([8]), expected);
  assert.ok(expected.find((f) => f.end === 3.5).valid);
  assert.equal(expected.find((f) => f.end === 4).valid, false);
  assert.ok(expected.find((f) => f.end === 6).valid);
});

test('Unannounced time discontinuities and layout changes cannot join unrelated samples', () => {
  const frames = [],
    p = new FeaturePipeline((f) => frames.push(f));
  p.ingest(block(0, 2));
  p.ingest(block(3, 0.5));
  assert.equal(frames.at(-1).gaps, 1);
  p.ingest(block(3.5, 1.5));
  assert.equal(frames.at(-1).waveform.start, 3);
  const other = block(5, 0.5);
  other.channels[0].name = 'F8-T8';
  p.ingest(other);
  assert.equal(frames.at(-1).end, 5);
});

test('A single missing sample remains excluded and reports the available continuous run', () => {
  const frames = [],
    p = new FeaturePipeline((f) => frames.push(f));
  p.ingest(block(0, 2, 1));
  const row = frames[0].channels[0];
  assert.equal(row.valid, false);
  assert.equal(row.analysis.reason, 'missing');
  assert.equal(row.analysis.missingFraction, 1 / 256);
  assert.equal(row.analysis.contiguousSeconds, 1);
  assert.equal(frames[0].waveform, null);
});
