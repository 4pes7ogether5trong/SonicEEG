import test from 'node:test';
import assert from 'node:assert/strict';
import {
  showcaseBlock,
  SHOWCASE_LENGTH,
  SHOWCASE_SENSORS,
  SEIZURE_INTERVALS,
} from '../showcase.js';
import { analyze } from '../signal.js';
import { FeaturePipeline } from '../pipeline.js';
import { TemporalHistory } from '../history.js';
import { BaselineMap } from '../baseline.js';

const summary = (time, slot = 0, duration = 2) =>
  showcaseBlock(time, duration, 128, { slot }).map((c) => ({
    name: c.name,
    ...analyze(c.samples, 128),
  }));
const largest = (cs) => cs.reduce((a, b) => (a.rms > b.rms ? a : b));
test('All four sampler signals are continuous across blocks and common-average referenced', () => {
  for (let slot = 0; slot < 4; slot++)
    for (const start of [9.5, 23.5, 119.5]) {
      const whole = showcaseBlock(start, 1, 128, { slot }),
        a = showcaseBlock(start, 0.5, 128, { slot }),
        b = showcaseBlock(start + 0.5, 0.5, 128, { slot });
      assert.equal(whole.length, SHOWCASE_SENSORS.length);
      for (let c = 0; c < whole.length; c++) {
        assert.deepEqual(whole[c].samples, Float64Array.from([...a[c].samples, ...b[c].samples]));
        assert.ok(whole[c].samples.every(Number.isFinite));
      }
      for (let i = 0; i < 128; i++)
        assert.ok(Math.abs(whole.reduce((sum, c) => sum + c.samples[i], 0)) < 1e-9);
    }
});
test('A has discrete synchronous 3/s spike-wave episodes with a symmetric frontal maximum', () => {
  const event = summary(14),
    front = event.find((c) => c.name === 'FZ-AVG');
  assert.equal(front.peakHz, 3);
  assert.ok(front.max - front.min > 100);
  assert.ok(front.rms > largest(summary(30)).rms * 4);
  for (const name of ['FP1-AVG', 'FP2-AVG', 'F3-AVG', 'F4-AVG', 'O1-AVG', 'O2-AVG'])
    assert.equal(event.find((c) => c.name === name).peakHz, 3, name);
  const left = event.find((c) => c.name === 'F3-AVG'),
    right = event.find((c) => c.name === 'F4-AVG');
  assert.ok(Math.abs(left.bands[0] - right.bands[0]) / left.bands[0] < 0.05);
  for (const [start, end] of SEIZURE_INTERVALS[0]) {
    assert.equal(end - start, 12);
    assert.equal(largest(summary(start + 2)).peakHz, 3);
    assert.ok(largest(summary(end + 2)).rms < 10);
  }
});
test('B sustains changing rhythmic activity for more than ten minutes', () => {
  assert.ok(SHOWCASE_LENGTH - SEIZURE_INTERVALS[1][0][0] > 600);
  const peaks = [];
  for (let t = 12; t < SHOWCASE_LENGTH - 2; t += 8) {
    const strong = largest(summary(t, 1));
    assert.ok(strong.rms > 18, t + ': ' + strong.rms);
    peaks.push(strong.peakHz);
  }
  assert.ok(Math.max(...peaks) - Math.min(...peaks) >= 1);
  assert.equal(largest(summary(13, 1)).name, 'T8-AVG');
});
test('C keeps high-amplitude slow sleep activity; D has intermittent broad frontal blinks', () => {
  const sleep = largest(summary(4, 2));
  assert.ok(sleep.peakHz >= 0.5 && sleep.peakHz <= 2);
  assert.ok(sleep.max - sleep.min > 75);
  assert.ok(sleep.bands[0] / sleep.bands.reduce((a, b) => a + b) > 0.95);
  const blink = largest(summary(8, 3)),
    awake = largest(summary(30, 3));
  assert.ok(['FP1-AVG', 'FP2-AVG'].includes(blink.name));
  assert.ok(blink.rms > awake.rms * 2);
  assert.ok(blink.peakHz < 4);
  assert.ok(awake.bands[3] > awake.bands[0] + awake.bands[1] + awake.bands[2]);
  assert.deepEqual(SEIZURE_INTERVALS.slice(2), [[], []]);
});
test('Sampler features separate brief A changes, sustained B, stable sleep and blink artifacts', () => {
  const results = [];
  for (let slot = 0; slot < 4; slot++) {
    const baseline = new BaselineMap(),
      history = new TemporalHistory(20);
    let last;
    const pipeline = new FeaturePipeline((f) => {
      baseline.apply(f);
      last = f;
      history.add(f);
    });
    for (let t = 0; t < 40; t += 0.5) {
      pipeline.ingest(
        { start: t, duration: 0.5, rate: 128, channels: showcaseBlock(t, 0.5, 128, { slot }) },
        { settings: { hp: 0.5, lp: 45, notch: 'off' }, segment: 'demo', source: 'demo' },
      );
      if (t === 5.5) assert.ok(baseline.pin(last));
    }
    const channels = history.overview(1)[0].channels;
    results.push({
      changed: Math.max(
        ...channels.map((c) => c.baseline.anyChangedSeconds / c.baseline.validSeconds),
      ),
      sharp: channels.reduce((sum, c) => sum + c.sharpCount, 0),
    });
    assert.equal(history.end, 40);
  }
  assert.ok(results[1].changed > results[0].changed);
  assert.ok(results[0].sharp > results[2].sharp);
  assert.ok(results[1].changed > 0.8);
  assert.ok(results[2].changed < 0.2);
  assert.ok(results[3].changed > 0 && results[3].changed < 0.5);
});
