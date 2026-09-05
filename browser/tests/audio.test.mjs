import test from 'node:test';
import assert from 'node:assert/strict';
import {
  carrier,
  audioLevels,
  LiveAudioState,
  FRESH_SECONDS,
} from '../audio-mapping.js';
import { PatientMixer } from '../audio.js';
import { FeaturePipeline } from '../pipeline.js';
import { patientDemoBlock } from '../demo.js';
import { TRIALS, scoreTrial } from '../exercise.js';

const channel = (name, rms, status = 'observed') => ({
  name,
  valid: true,
  status,
  bands: Array(5).fill(rms * rms),
});
const frame = (end, rms = 10) => ({
  start: end - 0.5,
  end,
  channels: [channel('F7-T7', rms), channel('F8-T8', rms)],
});

test('Four patients retain separate octave ranges and the same pentatonic intervals', () => {
  const tones = [];
  for (let slot = 0; slot < 4; slot++)
    for (let band = 0; band < 5; band++) {
      const f = carrier(slot, band);
      tones.push(f);
      if (slot) assert.ok(Math.abs(f / carrier(slot - 1, band) - 2) < 1e-12);
      if (band) assert.ok(f > carrier(slot, band - 1));
      if (slot < 3) assert.ok(f < carrier(slot + 1, 0));
    }
  assert.equal(new Set(tones).size, 20);
  assert.throws(() => carrier(4, 0), RangeError);
  assert.throws(() => carrier(-1, 0), RangeError);
});

test('Audio keeps amplitude differences and focal contributions without per-patient normalization', () => {
  const a = audioLevels(frame(1, 10)),
    b = audioLevels(frame(1, 20));
  assert.equal(b.levels[0].gain / a.levels[0].gain, 2);
  const f = {
    channels: [
      channel('F7-T7', 40),
      ...Array.from({ length: 10 }, () => channel('F3-C3', 4)),
      channel('FP1-T7', 400, 'derived'),
      { ...channel('T7-P7', 400), valid: false },
    ],
  };
  assert.equal(audioLevels(f).levels[0].rms, 40);
  assert.ok(audioLevels(f, { spatial: 'mean' }).levels[0].rms < 14);
  assert.equal(audioLevels(f).levels[1].rms, 0);
  assert.equal(
    audioLevels({ channels: [channel('F7-T7', 10, 'expected')] }).valid,
    false,
  );
  assert.equal(
    audioLevels(frame(1, 0)).valid,
    true,
    'genuine zero measurements remain distinct from gaps',
  );
});

test('Old intervals and view-style reads cannot refresh a stale patient or revive a stopped source', () => {
  let now = 0;
  const state = new LiveAudioState(() => now);
  for (let i = 0; i < 4; i++) {
    state.begin(i);
    assert.ok(state.ingest(i, frame(2)));
  }
  now = 2;
  assert.equal(state.ingest(0, frame(2)), false);
  assert.equal(state.ingest(0, frame(1.5)), false);
  state.ingest(1, frame(2.5));
  state.ingest(2, frame(2.5));
  state.ingest(3, frame(2.5));
  now = FRESH_SECONDS + 0.01;
  for (let i = 0; i < 100; i++) state.status(0);
  assert.equal(state.status(0), 'stale');
  for (const i of [1, 2, 3]) assert.equal(state.status(i), 'live');
  state.stop(1);
  assert.equal(state.ingest(1, frame(3)), false);
  assert.equal(state.status(2), 'live');
  state.begin(1);
  assert.equal(state.status(1), 'waiting');
  assert.ok(
    state.ingest(1, frame(0.5)),
    'a new source may start its own timeline',
  );
  assert.throws(() => state.begin(4), RangeError);
});

class Param {
  constructor() {
    this.value = 0;
    this.events = [];
  }
  setTargetAtTime(value, time, constant) {
    this.events.push({ type: 'target', value, time, constant });
  }
  setValueAtTime(value, time) {
    this.events.push({ type: 'value', value, time });
  }
  cancelScheduledValues(time) {
    this.events = this.events.filter((e) => e.time < time);
  }
}
class AudioNode {
  constructor() {
    for (const key of [
      'gain',
      'frequency',
      'pan',
      'threshold',
      'knee',
      'ratio',
    ])
      this[key] = new Param();
  }
  connect() {}
  disconnect() {}
  start() {}
  stop() {}
  setPeriodicWave() {}
}
class AudioContextDouble {
  constructor() {
    this.currentTime = 0;
    this.state = 'suspended';
    this.destination = {};
  }
  createGain() {
    return new AudioNode();
  }
  createDynamicsCompressor() {
    return new AudioNode();
  }
  createOscillator() {
    return new AudioNode();
  }
  createStereoPanner() {
    return new AudioNode();
  }
  createPeriodicWave() {
    return {};
  }
  async resume() {
    this.state = 'running';
  }
}

test('Audio-clock expiry, per-patient mute/focus and data-loss isolation do not depend on rendering', async () => {
  const context = new AudioContextDouble();
  const mixer = new PatientMixer({
    now: () => context.currentTime,
    contextFactory: () => context,
  });
  await mixer.enable();
  for (let slot = 0; slot < 4; slot++) {
    mixer.begin(slot);
    mixer.ingest(slot, frame(2, 20));
  }
  const deadline = () =>
    mixer.voices[0].voices[0].gain.gain.events.findLast(
      (e) => e.type === 'target' && e.value === 0,
    ).time;
  assert.equal(deadline(), FRESH_SECONDS);
  context.currentTime = 1;
  mixer.patient(0, { gain: 0.5, muted: true });
  assert.equal(mixer.voices[0].bus.gain.events.at(-1).value, 0);
  assert.equal(
    deadline(),
    FRESH_SECONDS,
    'mute changes must not postpone stale expiry',
  );
  mixer.patient(0, { muted: false });
  mixer.configure({ focus: 2 });
  assert.equal(mixer.voices[1].bus.gain.events.at(-1).value, 0.25);
  assert.equal(mixer.voices[2].bus.gain.events.at(-1).value, 1);
  assert.equal(deadline(), FRESH_SECONDS);
  mixer.unavailable(0);
  mixer.configure({ band: 2 });
  assert.equal(mixer.live.status(0), 'gap');
  assert.equal(mixer.voices[0].voices[0].gain.gain.events.at(-1).value, 0);
  assert.equal(mixer.live.status(1), 'live');
  mixer.stop(1);
  mixer.ingest(1, frame(3));
  assert.equal(mixer.live.status(1), 'stopped');
  context.currentTime = 5;
  mixer.disable();
  await mixer.enable();
  assert.ok(
    mixer.voices.every((patient) =>
      patient.voices.every((v) => v.gain.gain.events.at(-1).value === 0),
    ),
    'enabling sound never auditions old measurements',
  );
});

test('Four-stream synthetic pipeline produces only the programmed patient and band changes', () => {
  const spec = TRIALS[5],
    powers = [];
  for (let slot = 0; slot < 4; slot++) {
    const frames = [],
      pipeline = new FeaturePipeline((f) => frames.push(f));
    for (let start = 0; start < 16; start += 0.5)
      pipeline.ingest(
        {
          start,
          duration: 0.5,
          rate: 128,
          channels: patientDemoBlock(start, 0.5, 128, {
            slot,
            seed: 106,
            changes: [
              { start: 8, end: 14, slots: spec.targets, band: spec.band },
            ],
          }),
        },
        {
          settings: { hp: 0.5, lp: 45, notch: 'off' },
          source: 'demo',
          segment: 'exercise',
        },
      );
    const amplitudeAt = (end) =>
      audioLevels(frames.find((f) => f.end === end)).levels.find(
        (l) => l.band === spec.band && l.side === -1,
      ).rms;
    powers.push(amplitudeAt(12) / amplitudeAt(6));
    assert.equal(frames.at(-1).end, 16);
  }
  assert.ok(powers[0] > 10 && powers[3] > 10);
  assert.ok(powers[1] < 1.1 && powers[2] < 1.1);
  assert.equal(scoreTrial(5, [0, 3], 10).correct, true);
  assert.equal(scoreTrial(5, [0], 10).correct, false);
  assert.equal(scoreTrial(5, [0, 3], 7).correct, false);
});
