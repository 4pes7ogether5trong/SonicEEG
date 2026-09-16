import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PatternTracker,
  transientFeatures,
  persistenceEmphasis,
} from '../patterns.js';
import { FeaturePipeline } from '../pipeline.js';
import { patientDemoBlock, DEMO_LENGTH, DEMO_EVENTS } from '../demo.js';
import { TRIALS, trialEvents, TRIAL_DURATION } from '../exercise.js';

function runDemo(
  slot,
  { changes = null, rate = 128, end = DEMO_LENGTH, pin = false, seed = 1 } = {},
) {
  const tracker = new PatternTracker(),
    values = [],
    events = [];
  const pipeline = new FeaturePipeline((frame) => {
    const v = tracker.update(frame);
    values.push({ end: frame.end, ...v });
    events.push(...v.events);
    if (pin && frame.end === 6) tracker.pin(frame);
  });
  for (let start = 0; start < end; start += 0.5)
    pipeline.ingest(
      {
        start,
        duration: 0.5,
        rate,
        channels: patientDemoBlock(start, 0.5, rate, { slot, changes, seed }),
      },
      { segment: 'demo', settings: { hp: 0.5, lp: 45, notch: 'off' } },
    );
  return { values, events };
}
const row = (rms, name = 'F7-T7', events = []) => ({
  name,
  valid: true,
  status: 'observed',
  bands: Array(5).fill(rms * rms),
  transients: { available: true, events },
});
const frame = (end, rms = 10, extra = {}) => ({
  start: end - 0.5,
  end,
  segment: 'one',
  settings: { hp: 0.5, lp: 45 },
  channels: [row(rms)],
  ...extra,
});

test('Ten-second attention landmark follows observed train onset and does not advance from repeated reads or missing cycles', () => {
  const tracker = new PatternTracker();
  const emit = (end, eventTime) =>
    tracker.update(
      frame(end, 10, {
        channels: [
          row(
            10,
            'F7-T7',
            eventTime == null
              ? []
              : [
                  {
                    time: eventTime,
                    amplitude: 60,
                    width: 0.03,
                    afterwave: 0.2,
                  },
                ],
          ),
        ],
      }),
    );
  for (let end = 0.5; end <= 11; end += 0.5) {
    const value = emit(end, Number.isInteger(end) ? end - 0.2 : null);
    if (end === 3) assert.ok(Math.abs(value.sharpSeconds - 2) < 1e-9);
    if (end === 10) assert.equal(value.sustained, false);
    if (end === 11) {
      assert.equal(value.sharpSeconds, 10);
      assert.equal(value.sustained, true);
    }
  }
  const value = emit(11, 10.8);
  assert.equal(value.sharpSeconds, 10);
  assert.equal(
    emit(11.5, null).sharpSeconds,
    10,
    'waiting for a next cycle is not extra observed duration',
  );
  emit(13, null);
  for (let end = 14; end <= 16; end++) emit(end, end - 0.2);
  assert.ok(tracker.value.sharpSeconds < 3);
  assert.equal(tracker.value.sustained, false);
  assert.ok(
    persistenceEmphasis(10.5, 0) - persistenceEmphasis(10, 0) >
      persistenceEmphasis(9.5, 0) - persistenceEmphasis(9, 0),
  );
  assert.ok(
    Math.abs(persistenceEmphasis(10, 0) - persistenceEmphasis(9.999, 0)) <
      0.001,
    'no loudness step at the landmark',
  );
});

test('Guided synthetic shapes recover programmed counts, repetition rates and sensor-side extent', () => {
  const expected = [
    { count: 26, end: 30, hz: 1.25, side: 'left' },
    { count: 24, end: 50, hz: 1, side: 'bilateral' },
    { count: 60, end: 60, hz: 3, side: 'bilateral' },
    { count: 27, end: 76, hz: 1.5, side: 'right' },
  ];
  expected.forEach((want, slot) => {
    const result = runDemo(slot),
      v = result.values.find((v) => v.end === want.end);
    assert.equal(result.events.length, want.count, `patient ${slot} count`);
    assert.ok(Math.abs(v.repetitionHz - want.hz) < 0.04);
    assert.equal(v.distribution, want.side);
    assert.ok(
      result.values
        .filter((v) => v.end <= 6)
        .every((v) => v.emphasis === 0 && !v.events.length),
    );
    assert.ok(result.values.every((v) => v.emphasis >= 0 && v.emphasis <= 1));
  });
});

test('Every revised listening clip produces the intended target-only morphology and a quiet reference', () => {
  TRIALS.forEach((spec, trial) => {
    spec.active.forEach((slot) => {
      const { events, values } = runDemo(slot, {
        changes: trialEvents(trial),
        end: TRIAL_DURATION,
        pin: true,
        seed: trial + 101,
      });
      const target = spec.targets.includes(slot);
      assert.equal(
        events.length > 0,
        target,
        `trial ${trial + 1}, patient ${slot}`,
      );
      if (target && spec.type === 'single') assert.equal(events.length, 1);
      if (target && spec.type !== 'single')
        assert.ok(values.find((v) => v.end === 22).emphasis > 0.5);
      assert.ok(values.filter((v) => v.end < 8).every((v) => v.emphasis === 0));
      if (!target) assert.ok(values.every((v) => v.emphasis === 0));
    });
  });
});

test('A single short event remains visible immediately; persistent activity grows and releases gradually', () => {
  const isolated = runDemo(0, { changes: [DEMO_EVENTS[0]], end: 30 });
  assert.equal(isolated.events.length, 1);
  assert.ok(isolated.values.some((v) => v.end <= 9 && v.events.length === 1));
  assert.ok(
    Math.max(...isolated.values.map((v) => v.emphasis)) < 0.1,
    'an isolated event does not build a sustained alarm',
  );
  const repeated = runDemo(0, { changes: [DEMO_EVENTS[1]], end: 70 }),
    at = (t) => repeated.values.find((v) => v.end === t);
  assert.ok(at(30).emphasis > at(20).emphasis);
  assert.ok(at(36).emphasis > 0.6);
  assert.ok(
    at(42).emphasis > 0 && at(42).emphasis < at(36).emphasis,
    'release is audible rather than instantaneous',
  );
  assert.ok(at(70).emphasis < 0.06);
});

test('Recent recurrence contributes bounded memory but does not claim continuous persistence across a quiet interval', () => {
  const tracker = new PatternTracker();
  let before;
  for (let end = 0.5; end <= 16; end += 0.5) {
    const time = end - 0.2,
      events = [1, 1.5, 2, 6, 6.5, 7].includes(end)
        ? [{ time, amplitude: 60, width: 0.03, afterwave: 0.4 }]
        : [];
    const value = tracker.update(
      frame(end, 10, { channels: [row(10, 'F7-T7', events)] }),
    );
    if (end === 3) before = value.recurrence;
    if (end === 5) assert.equal(value.persistence, 0);
    if (end === 8) assert.ok(value.recurrence > before);
  }
  assert.equal(tracker.value.persistence, 0);
  assert.equal(tracker.value.repetitionHz, 0);
});

test('A pinned reference detects sustained amplitude increase and attenuation without normalizing either away', () => {
  for (const [baseline, changed] of [
    [10, 40],
    [40, 1],
  ]) {
    const tracker = new PatternTracker();
    tracker.update(frame(2, baseline));
    assert.ok(tracker.pin(frame(2, baseline)));
    const fixed = tracker.baseline.get('F7-T7');
    for (let end = 2.5; end <= 34; end += 0.5)
      tracker.update(frame(end, changed));
    assert.equal(tracker.baseline.get('F7-T7'), fixed);
    assert.ok(tracker.value.deviation > 0.35 && tracker.value.emphasis > 0.9);
    assert.ok(tracker.value.persistence > 30);
    assert.equal(
      tracker.value.events.length,
      0,
      'spectral change does not invent sharp events',
    );
  }
});

test('Gaps erase persistence; changed recording context clears the pinned reference even after a gap', () => {
  const tracker = new PatternTracker();
  tracker.update(frame(2));
  tracker.pin(frame(2));
  for (let end = 2.5; end <= 12; end += 0.5) tracker.update(frame(end, 40));
  assert.ok(tracker.value.emphasis > 0.4);
  tracker.update(frame(12.5, 10, { channels: [] }));
  assert.equal(tracker.value.emphasis, 0);
  assert.ok(tracker.baseline);
  tracker.update(frame(13, 40, { settings: { hp: 1, lp: 35 } }));
  assert.equal(tracker.baseline, null);
  assert.equal(tracker.value.emphasis, 0);
  tracker.pin(frame(13, 40, { settings: { hp: 1, lp: 35 } }));
  tracker.update(frame(14, 80, { segment: 'two' }));
  assert.equal(tracker.baseline, null);
  tracker.update(frame(14.5, 80, { mixed: true }));
  assert.equal(tracker.value.available, false);
  assert.equal(tracker.pin(frame(15, 10, { mixed: true })), false);
});

test('Overlapping windows and bilateral copies produce one accent, not invented extra repetition', () => {
  const tracker = new PatternTracker(),
    event = { time: 1.7, amplitude: 60, width: 0.03, afterwave: 0.4 };
  const c = [
    row(10, 'F7-T7', [event]),
    row(10, 'F8-T8', [{ ...event, time: 1.72 }]),
    { ...row(10, 'FP1-T7', [event]), status: 'derived' },
  ];
  const first = tracker.update(frame(2, 10, { channels: c }));
  assert.equal(first.events.length, 1);
  assert.equal(first.distribution, 'bilateral');
  assert.deepEqual(first.events[0].channels, ['F7-T7', 'F8-T8']);
  assert.equal(
    tracker.update(frame(2.5, 10, { channels: c })).events.length,
    0,
  );
  assert.equal(tracker.update(frame(2, 10, { channels: c })).events.length, 0);
  assert.equal(tracker.value.repetitionHz, 0);
});

test('Sharp-shape descriptors reject inadequate or missing display samples and retain comparable rates at 128/256 Hz', () => {
  assert.equal(
    transientFeatures(new Float32Array(128), 64, 0).available,
    false,
  );
  const missing = new Float32Array(256);
  missing[10] = NaN;
  assert.equal(transientFeatures(missing, 128, 0).available, false);
  assert.deepEqual(transientFeatures(new Float32Array(256), 128, 0).events, []);
  const e = [
    {
      start: 2,
      end: 10,
      slots: [1],
      type: 'periodic',
      hz: 1,
      location: 'bilateral',
    },
  ];
  for (const rate of [128, 256]) {
    const { values, events } = runDemo(1, { changes: e, rate, end: 13 });
    assert.equal(events.length, 8);
    assert.ok(
      Math.abs(values.find((v) => v.end === 8).repetitionHz - 1) < 0.03,
    );
  }
});
