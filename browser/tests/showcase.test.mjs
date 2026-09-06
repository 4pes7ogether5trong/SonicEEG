import test from 'node:test';
import assert from 'node:assert/strict';
import { showcaseBlock, SHOWCASE_LENGTH, SHOWCASE_SENSORS } from '../showcase.js';
import { analyze } from '../signal.js';
import { POSITIONS } from '../montage.js';

const summary = (time) => showcaseBlock(time, 2, 128).map(c => ({
  ...analyze(c.samples, 128), name: c.name,
}));
test('Showcase remains continuous across blocks and uses a common average reference', () => {
  const whole = showcaseBlock(47.5, 1), a = showcaseBlock(47.5), b = showcaseBlock(48);
  assert.equal(whole.length, SHOWCASE_SENSORS.length);
  for (let c = 0; c < whole.length; c++) {
    assert.deepEqual(whole[c].samples, Float64Array.from([...a[c].samples, ...b[c].samples]));
    assert.ok(whole[c].samples.every(Number.isFinite));
  }
  for (let i = 0; i < 128; i++)
    assert.ok(Math.abs(whole.reduce((sum, c) => sum + c.samples[i], 0)) < 1e-9);
});
test('Traveling scene changes both sensor location and dominant frequency', () => {
  const early = summary(27), late = summary(43);
  const strongest = cs => cs.reduce((a,b) => a.rms > b.rms ? a : b);
  const e = strongest(early), l = strongest(late);
  assert.ok(POSITIONS[e.name.split('-')[0]][0] < 0, e.name);
  assert.ok(POSITIONS[l.name.split('-')[0]][0] > 0, l.name);
  assert.ok(e.peakHz < 9, e.peakHz);
  assert.ok(l.peakHz > 16, l.peakHz);
});
test('Quiet intervals, bursts and layered scenes produce distinct measurable changes', () => {
  const maxRms = (time, duration) => Math.max(...showcaseBlock(time, duration).map(c => analyze(c.samples, 128).rms));
  assert.ok(maxRms(105.7, .5) > maxRms(104.1, .5) * 4);
  const layered = summary(127);
  for (const band of [1, 2, 4]) assert.ok(layered.some(c => c.bands[band] > 8));
  assert.equal(SHOWCASE_LENGTH, 144);
  const other = showcaseBlock(43, 2, 128, { slot: 1, seed: 2 });
  const strongest = other.map(c => ({name:c.name, ...analyze(c.samples,128)})).sort((a,b)=>b.rms-a.rms)[0];
  assert.ok(POSITIONS[strongest.name.split('-')[0]][0] < 0);
});
