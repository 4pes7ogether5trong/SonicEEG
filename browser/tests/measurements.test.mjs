import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyze,
  demoBlock,
  amplitudeHistogram,
  prevalence,
} from '../signal.js';
import {
  recognizeMontage,
  parseDerivation,
  parseSettings,
  findDerivations,
  derive,
  TEMPLATES,
} from '../montage.js';
import { ScreenStitcher } from '../stitch.js';
import { FeaturePipeline } from '../pipeline.js';
import { TemporalHistory, mergeBins } from '../history.js';
import {
  scalpGrid,
  fieldWeights,
  sampleField,
  timePosition,
} from '../field-math.js';
const sine = (amp, f, rate = 128, n = 256) =>
  Float32Array.from(
    { length: n },
    (_, i) => amp * Math.sin((2 * Math.PI * f * i) / rate),
  );
test('Calibrated sinusoid: RMS and integrated spectral power retain physical units', () => {
  const f = analyze(sine(20, 10), 128);
  assert.ok(Math.abs(f.rms - Math.sqrt(200)) < 1e-5);
  assert.ok(Math.abs(f.total - 200) < 0.1);
  assert.equal(f.peakHz, 10);
  const g = analyze(sine(40, 10), 128);
  assert.ok(Math.abs(g.rms / f.rms - 2) < 1e-5);
  assert.ok(Math.abs(g.bands[2] / f.bands[2] - 4) < 1e-5);
});
test('Non power-of-two data remain calibrated with zero padding', () => {
  const f = analyze(sine(10, 10, 150, 300), 150);
  assert.ok(Math.abs(f.total - 50) < 0.1);
  assert.ok(Math.abs(f.peakHz - 10) < 0.3);
});
test('Missing samples do not create a fabricated spectrum', () => {
  const s = sine(20, 10);
  s[100] = NaN;
  assert.equal(analyze(s, 128).valid, false);
});
test('Filter cutoffs and display Nyquist remain explicit', () => {
  const f = analyze(sine(20, 10), 128, { hp: 2, lp: 15, notch: 'off' });
  assert.deepEqual(f.affected, [true, false, false, true, true]);
  assert.equal(analyze(sine(10, 3, 32), 32).affected[4], true);
});
test('Electrode aliases and actual derivations identify a partial longitudinal montage', () => {
  assert.equal(parseDerivation('EEG F7 – T3').name, 'F7-T7');
  assert.equal(parseDerivation('Patient Name'), null);
  const m = recognizeMontage(
    TEMPLATES[0].channels.filter((n) => n !== 'T7-P7'),
  );
  assert.equal(m.name, 'Longitudinal bipolar');
  assert.deepEqual(m.missing, ['T7-P7']);
});
test('Too few observations do not establish a template', () => {
  assert.equal(recognizeMontage(['FP1-F7', 'F7-T7']).match, false);
  assert.deepEqual(
    findDerivations('Patient 123\nFp1-F7\nF7-T3').map((x) => x.name),
    ['FP1-F7', 'F7-T7'],
  );
});
test('Only supported display settings survive OCR parsing', () => {
  assert.deepEqual(
    parseSettings(
      'Jane Doe 123 HP: 1 Hz LP: 70 Hz notch 60 Hz 10 sec/page 7 uV/mm',
    ),
    { hp: 1, lp: 70, notch: '60', seconds: 10, sensitivity: 7 },
  );
});
const ch = (name, samples, extra = {}) => ({
  name,
  samples: Float32Array.from(samples),
  segment: 'a',
  start: 0,
  rate: 128,
  valid: true,
  ...extra,
});
test('A connected voltage path can recover a hidden derivation without a cortical model', () => {
  const d = derive('F7-P7', [ch('F7-T7', [1, 3, -2]), ch('T7-P7', [4, -1, 2])]);
  assert.deepEqual([...d.samples], [5, 2, 0]);
  assert.equal(d.status, 'derived');
  assert.equal(derive('F7-O2', [ch('F7-T7', [1])]), null);
});
test('Derived traces reject misaligned recordings and disconnected references', () => {
  assert.equal(
    derive('F7-P7', [ch('F7-T7', [1]), ch('T7-P7', [2], { segment: 'b' })]),
    null,
  );
  assert.equal(derive('F7-P7', [ch('F7-REF', [1]), ch('P7-AVG', [2])]), null);
});
function scroll(start) {
  return ['FP1-F7', 'F7-T7'].map((name, c) => ({
    name,
    valid: true,
    samples: Float32Array.from({ length: 1024 }, (_, i) => {
      const t = (start + i) / 128;
      return (
        10 * Math.sin(2 * Math.PI * 7.3 * t + c) +
        5 * Math.sin(2 * Math.PI * 11.67 * t + c * 0.7) +
        3 * Math.cos(2 * Math.PI * 2.33 * t)
      );
    }),
  }));
}
test('Screen stitching appends only the newly displayed interval', () => {
  const s = new ScreenStitcher({ seconds: 8 });
  assert.equal(s.push(scroll(0), 0).channels, undefined);
  const r = s.push(scroll(64), 0.5);
  assert.equal(r.channels[0].samples.length, 64);
  assert.equal(r.start, 0);
  assert.equal(r.duration, 0.5);
  assert.equal(s.push(scroll(64), 1).reason, 'Screen has not advanced');
});
test('Long capture gaps break continuity', () => {
  const s = new ScreenStitcher({ seconds: 8 });
  s.push(scroll(0), 0);
  assert.equal(s.push(scroll(1024), 8).gap, true);
});
test('A swept display preserves duration and marks an unrecoverable page wrap', () => {
  const s = new ScreenStitcher({ seconds: 8, mode: 'sweep' });
  s.push(scroll(0), 0, 50);
  assert.equal(s.push(scroll(0), 0.5, 114).duration, 0.5);
  s.previous.cursor = 1000;
  assert.equal(s.push(scroll(0), 1, 40).gap, true);
});
test('Feature pipeline never counts overlapping analysis windows twice', () => {
  const frames = [],
    p = new FeaturePipeline((f) => frames.push(f));
  for (let t = 0; t < 10; t += 0.5)
    p.ingest(
      { start: t, duration: 0.5, rate: 128, channels: demoBlock(t, 0.5) },
      { segment: 'one', source: 'demo' },
    );
  assert.equal(frames.at(-1).end, 10);
  assert.equal(
    frames.reduce((s, f) => s + f.end - f.start, 0),
    10,
  );
  for (let i = 1; i < frames.length; i++)
    assert.equal(frames[i].start, frames[i - 1].end);
});
const frame = (t, power = 1, segment = 'a') => ({
  start: t,
  end: t + 1,
  segment,
  source: 'demo',
  settings: { hp: 0.5, lp: 45 },
  gaps: 0,
  channels: [
    {
      name: 'F7-T7',
      status: 'observed',
      valid: true,
      validSeconds: 1,
      bands: [power, 0, 0, 0, 0],
      rms: Math.sqrt(power),
      min: -5,
      max: 5,
      last: 0,
      quality: 1,
    },
  ],
});
test('Temporal compression retains rare peaks and the complete recording extent', () => {
  const h = new TemporalHistory(8);
  for (let i = 0; i < 5000; i++) h.add(frame(i, i === 25 ? 1000 : 1));
  assert.equal(h.end, 5000);
  assert.ok(h.bins().length < 100);
  const all = h.overview(1)[0];
  assert.equal(all.channels[0].validSeconds, 5000);
  assert.equal(all.channels[0].peakBands[0], 1000);
  assert.ok(Math.abs(all.channels[0].bands[0] - 5999 / 5000) < 1e-10);
});
test('Incompatible recording contexts remain marked in compressed history', () => {
  const f = mergeBins(frame(0, 1, 'a'), frame(1, 1, 'b'));
  assert.equal(f.mixed, true);
  assert.equal(f.channels[0].valid, false);
});
test('Prevalence preserves a brief amplitude criterion without depicting it as sustained', () => {
  const h = new TemporalHistory(8);
  for (let i = 0; i < 100; i++) {
    const f = frame(i, i === 25 ? 2500 : 25);
    f.channels[0].amplitudeHistogram = amplitudeHistogram(
      f.channels[0].bands,
      1,
    );
    h.add(f);
  }
  const c = h.overview(1)[0].channels[0];
  assert.equal(prevalence(c, 0, 2), 0.01);
  assert.equal(c.peakBands[0], 2500);
  assert.equal(prevalence(c, 0, 0), 1);
});
test('Missing pixels invalidate their spectral windows even when the trace path is mostly present', () => {
  const frames = [],
    p = new FeaturePipeline((f) => frames.push(f));
  for (let t = 0; t < 4; t += 0.5) {
    const channels = demoBlock(t, 0.5);
    channels[0].observed = new Uint8Array(64).fill(1);
    if (t === 1) channels[0].observed[20] = 0;
    p.ingest(
      { start: t, duration: 0.5, rate: 128, channels },
      { segment: 'a' },
    );
  }
  assert.equal(frames[0].channels[0].valid, false);
  assert.equal(frames.at(-1).channels[0].valid, true);
});
test('Time lens is monotonic and preserves both endpoints', () => {
  for (const focus of [0, 50, 100]) {
    const xs = Array.from({ length: 101 }, (_, i) =>
      timePosition(i, 100, focus, 1),
    );
    assert.ok(Math.abs(xs[0]) < 1e-12);
    assert.ok(Math.abs(xs.at(-1) - 1) < 1e-12);
    for (let i = 1; i < xs.length; i++) assert.ok(xs[i] > xs[i - 1]);
  }
});
test('An unseen channel cannot light the surface', () => {
  const grid = scalpGrid(8, 12),
    weights = fieldWeights(grid.vertices, ['F7-T7']);
  for (const w of weights) {
    const f = sampleField(
      w,
      [{ name: 'F7-T7', valid: false, bands: [1000, 0, 0, 0, 0] }],
      0,
    );
    assert.equal(f.coverage, 0);
  }
});
