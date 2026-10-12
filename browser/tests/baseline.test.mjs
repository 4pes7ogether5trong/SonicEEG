import test from 'node:test';
import assert from 'node:assert/strict';
import { BaselineMap, mergeBaseline } from '../baseline.js';
import { baselineField } from '../field-math.js';
import { mergeBins, TemporalHistory } from '../history.js';
const frame = (rms = 10, start = 0, dt = 0.5) => ({
  start,
  end: start + dt,
  settings: { hp: 0.5, lp: 45 },
  source: 'demo',
  segment: 'one',
  channels: [
    {
      name: 'F3-AVG',
      status: 'observed',
      valid: true,
      validSeconds: dt,
      bands: [rms * rms, 0, 0, 0, 0],
    },
  ],
});
test('Fixed reference measures signed dB change with a finite low-power floor', () => {
  const m = new BaselineMap();
  assert.ok(m.pin(frame()));
  const up = frame(22),
    down = frame(4),
    zero = frame(0);
  for (const f of [up, down, zero]) m.apply(f);
  assert.ok(Math.abs(up.channels[0].baseline.dbSums[0] / 0.5 - 20 * Math.log10(2)) < 1e-10);
  assert.ok(Math.abs(down.channels[0].baseline.dbSums[0] / 0.5 + 20 * Math.log10(2)) < 1e-10);
  assert.equal(up.channels[0].baseline.changedSeconds[0], 0.5);
  assert.ok(zero.channels[0].baseline.dbSums.every(Number.isFinite));
  assert.equal(up.channels[0].baseline.changedSeconds[1], 0);
});
test('Compression counts compared valid duration and preserves rare changes', () => {
  const m = new BaselineMap();
  m.pin(frame());
  const brief = frame(22, 2, 0.5),
    quiet = frame(10, 2.5, 9.5),
    before = frame(10, 0, 2);
  m.apply(brief);
  m.apply(quiet);
  const c = mergeBins(mergeBins(before, brief), quiet).channels[0];
  assert.equal(c.baseline.validSeconds, 10);
  assert.equal(c.baseline.anyChangedSeconds, 0.5);
  const view = baselineField([{ weight: 1 }], [c], { map: 'prevalence' });
  assert.equal(view.amp, 0.05);
  assert.equal(baselineField([{ weight: 1 }], before.channels).coverage, 0);
});
test('Unavailable measurements, invalidated capture and incompatible references never become baseline evidence', () => {
  const m = new BaselineMap();
  m.pin(frame());
  const invalid = frame(22);
  invalid.channels[0].valid = false;
  m.apply(invalid);
  assert.equal(invalid.channels[0].baseline, undefined);
  const derived = frame();
  derived.channels[0].status = 'derived';
  m.apply(derived);
  assert.equal(derived.channels[0].baseline, undefined);
  const first = frame(22);
  m.apply(first);
  m.pin(frame(30));
  const second = frame(22, 0.5);
  m.apply(second);
  const mixed = mergeBaseline(first.channels[0].baseline, second.channels[0].baseline);
  assert.equal(mixed.mixed, true);
  assert.equal(mergeBaseline(mixed, second.channels[0].baseline).validSeconds, 0);
  const h = new TemporalHistory();
  h.add(second);
  h.invalidateSince(0);
  assert.equal(second.channels[0].baseline, null);
});
test('Patients have independent references and recording changes require a new pin', () => {
  const a = new BaselineMap(),
    b = new BaselineMap();
  a.pin(frame(10));
  b.pin(frame(22));
  const fa = frame(22),
    fb = frame(22);
  a.apply(fa);
  b.apply(fb);
  assert.equal(fa.channels[0].baseline.anyChangedSeconds, 0.5);
  assert.equal(fb.channels[0].baseline.anyChangedSeconds, 0);
  const changed = frame(22);
  changed.settings.hp = 1;
  a.apply(changed);
  assert.equal(a.reference, null);
  assert.equal(changed.channels[0].baseline, undefined);
  assert.ok(b.reference);
  a.pin(frame());
  const boundary = frame();
  boundary.segment = 'two';
  a.apply(boundary);
  assert.equal(a.reference, null);
});
