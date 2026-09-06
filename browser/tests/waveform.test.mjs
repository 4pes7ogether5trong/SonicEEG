import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { retainWaveform, reliefGeometry, recentWaveforms, WAVEFORM_POINTS } from '../waveform.js';
import { FeaturePipeline } from '../pipeline.js';
import { TemporalHistory, mergeBins, LocalArchive } from '../history.js';
import { showcaseBlock } from '../showcase.js';
import { POSITIONS } from '../montage.js';
import { FluidField } from '../field.js';

const frame = (start = 14, slot = 0) => {
  let result;
  new FeaturePipeline((f) => (result = f)).ingest(
    { start, duration: 2, rate: 128, channels: showcaseBlock(start, 2, 128, { slot }) },
    { source: 'demo', segment: 'same' },
  );
  return result;
};
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

test('Retained samples preserve signed morphology, timing and simultaneous channel phase', () => {
  const f = frame(),
    source = showcaseBlock(14, 2, 128, { slot: 0 });
  assert.equal(f.waveform.start, 14);
  assert.equal(f.waveform.end, 16);
  for (const c of f.waveform.channels) {
    const original = source.find((s) => s.name === c.name).samples;
    const mean = original.reduce((s, v) => s + v, 0) / original.length;
    assert.equal(c.wave.samples.length, 256);
    assert.equal(c.wave.times, null);
    for (let i = 0; i < 256; i++)
      assert.ok(Math.abs(c.wave.samples[i] - (original[i] - mean)) < 0.00002);
  }
});
test('Display compression preserves narrow extrema at their actual times and rejects missing samples', () => {
  const samples = new Float64Array(2000);
  samples[899] = 100;
  samples[901] = -80;
  const wave = retainWaveform(samples, 1000),
    mean = 0.01;
  assert.ok(wave.samples.length <= WAVEFORM_POINTS);
  const hi = wave.samples.indexOf(Math.max(...wave.samples)),
    lo = wave.samples.indexOf(Math.min(...wave.samples));
  assert.ok(Math.abs(wave.samples[hi] - (100 - mean)) < 0.00001);
  assert.ok(Math.abs(wave.samples[lo] - (-80 - mean)) < 0.00001);
  assert.ok(Math.abs(wave.times[hi] - 0.899) < 1e-6);
  assert.ok(Math.abs(wave.times[lo] - 0.901) < 1e-6);
  for (let i = 1; i < wave.times.length; i++) assert.ok(wave.times[i] > wave.times[i - 1]);
  samples[12] = NaN;
  assert.equal(retainWaveform(samples, 1000), null);
});
test('Compaction retains a complete observed multichannel example without averaging or mixing settings', () => {
  const quiet = frame(0),
    event = frame(14),
    late = frame(30);
  const merged = mergeBins(mergeBins(quiet, event), late);
  assert.equal(merged.waveform, event.waveform);
  assert.equal(merged.waveform.channels[0], event.waveform.channels[0]);
  assert.equal(mergeBins(quiet, { ...event, segment: 'changed' }).waveform, null);
  const history = new TemporalHistory(2);
  for (let t = 0; t < 40; t += 2) history.add(frame(t));
  assert.ok(history.overview(1)[0].waveform.sharp > 0);
  history.invalidateSince(0);
  assert.ok(history.bins().every((f) => f.waveform === null));
});
test('Recent stack contains at most six chronological nonoverlapping windows and no future examples', () => {
  const frames = [];
  for (let t = 0; t < 20; t += 0.5) frames.push(frame(t));
  const recent = recentWaveforms(frames, 18);
  assert.equal(recent.length, 6);
  assert.equal(recent.at(-1).end, 18);
  for (let i = 1; i < recent.length; i++) assert.ok(recent[i].start >= recent[i - 1].end);
  assert.deepEqual(recentWaveforms([{ ...frames[0], mixed: true }], 20), []);
  assert.deepEqual(recentWaveforms([{ ...frames[0], settingsUncertain: true }], 20), []);
});
test('Relief depth keeps voltage scale, polarity and sample order; display caps do not modify measurements', () => {
  const samples = Float32Array.from({ length: 256 }, (_, i) => 20 * Math.sin((i * Math.PI) / 32));
  const c = { name: 'F3-F4', valid: true, wave: retainWaveform(samples, 128) };
  const flat = reliefGeometry({ ...c, wave: retainWaveform(new Float32Array(256), 128) });
  const one = reliefGeometry(c),
    two = reliefGeometry(c, { scale: 40 });
  for (let i = 0; i < 256; i++) {
    const j = i * one.cols + 1;
    assert.ok(
      Math.abs(distance(one.positions[j], flat.positions[j]) - (Math.abs(samples[i]) / 80) * 0.12) <
        1e-6,
    );
    assert.ok(
      Math.abs(
        distance(two.positions[j], flat.positions[j]) -
          2 * distance(one.positions[j], flat.positions[j]),
      ) < 1e-6,
    );
    const delta = one.positions[j].map((v, k) => v - flat.positions[j][k]);
    const radialDot = delta.reduce((s, v, k) => s + v * flat.positions[j][k], 0);
    if (Math.abs(samples[i]) > 1) assert.equal(Math.sign(radialDot), Math.sign(samples[i]));
  }
  const before = c.wave.samples.slice();
  reliefGeometry(c, { scale: 1 });
  assert.deepEqual(c.wave.samples, before);
});
test('Known electrode arcs stay finite, section cuts remove triangles, and unavailable channels stay empty', () => {
  const wave = retainWaveform(
    Float32Array.from({ length: 8 }, (_, i) => i),
    4,
  );
  for (const a of Object.keys(POSITIONS))
    for (const b of Object.keys(POSITIONS)) {
      if (a === b) continue;
      const geometry = reliefGeometry({ name: a + '-' + b, valid: true, wave });
      if (geometry) assert.ok(geometry.positions.flat().every(Number.isFinite));
    }
  const c = { name: 'F3-AVG', valid: true, wave };
  const cut = reliefGeometry(c, { cut: -0.5 });
  assert.ok(cut.indices.every((i) => cut.positions[i][0] <= -0.5));
  assert.equal(reliefGeometry({ ...c, valid: false }), null);
});
test('A spike-wave and C slow-wave textures preserve different morphology even with color off', () => {
  const a = frame().waveform.channels.find((c) => c.name === 'FZ-AVG');
  const c = frame(14, 2).waveform.channels.find((c) => c.name === 'FZ-AVG');
  const curvature = (wave) =>
    wave.samples
      .slice(2)
      .reduce((s, v, i) => s + (v - 2 * wave.samples[i + 1] + wave.samples[i]) ** 2, 0);
  assert.ok(curvature(a.wave) > curvature(c.wave) * 10);
  const peaks = [];
  for (let i = 1; i < a.wave.samples.length - 1; i++)
    if (
      a.wave.samples[i] > 40 &&
      a.wave.samples[i] > a.wave.samples[i - 1] &&
      a.wave.samples[i] > a.wave.samples[i + 1]
    )
      peaks.push(i);
  assert.equal(peaks.length, 6);
  const field = Object.create(FluidField.prototype);
  field.options = { scale: 80, cut: 20, band: -1 };
  const f = { waveform: { channels: [a, c] } };
  const color = field.reliefData(f, { radial: 1 });
  field.options.monochrome = true;
  const mono = field.reliefData(f, { radial: 1 });
  assert.deepEqual(
    mono.map((p) => p.positions),
    color.map((p) => p.positions),
  );
  assert.ok(mono[0].color.equals(mono[1].color));
});
test('Local archive round-trips waveform typed arrays and invalidation removes them', async () => {
  const archive = new LocalArchive();
  await archive.open();
  const id = await archive.create('synthetic-relief');
  const f = frame();
  await archive.append(f, id);
  const saved = (await archive.frames(id))[0];
  assert.deepEqual(saved.waveform, f.waveform);
  await archive.invalidateSince(id, 14);
  assert.equal((await archive.frames(id))[0].waveform, null);
  await archive.erase(id);
  archive.db.close();
});
