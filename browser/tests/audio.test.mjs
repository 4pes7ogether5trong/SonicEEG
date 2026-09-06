import test from 'node:test';
import assert from 'node:assert/strict';
import {
  carrier,
  audioLevels,
  LiveAudioState,
  FRESH_SECONDS,
  VOICE_PROFILES,
  outputCurve,
} from '../audio-mapping.js';
import { PatientMixer } from '../audio.js';
import { FeaturePipeline } from '../pipeline.js';
import { patientDemoBlock } from '../demo.js';
import {
  TRIALS,
  scoreTrial,
  prepareExercise,
  listeningSettings,
  trialAudible,
  trialEvents,
  TRIAL_DURATION,
} from '../exercise.js';

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
      'Q',
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
  createWaveShaper() {
    return new AudioNode();
  }
  createBiquadFilter() {
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

test('Comfort settings survive exercise preparation; zero-level or interrupted sound cannot pass readiness', async () => {
  const context = new AudioContextDouble(),
    mixer = new PatientMixer({ contextFactory: () => context });
  await mixer.enable();
  mixer.configure({ volume: 0.72, band: 3, focus: 2, ambient: false });
  [1.3, 0.8, 1.5, 1.1].forEach((gain, slot) =>
    mixer.patient(slot, { gain, muted: true }),
  );
  prepareExercise(mixer);
  assert.deepEqual(listeningSettings(mixer), {
    master: 0.72,
    gains: [1.3, 0.8, 1.5, 1.1],
    spatial: 'maximum',
    band: -1,
    emphasis: true,
    focus: -1,
  });
  assert.equal(trialAudible(mixer, 2), true);
  mixer.patient(0, { gain: 0 });
  assert.equal(trialAudible(mixer, 2), false);
  mixer.patient(0, { gain: 1 });
  mixer.configure({ volume: 0 });
  assert.equal(trialAudible(mixer, 2), false);
  mixer.configure({ volume: 0.4 });
  context.state = 'suspended';
  assert.equal(trialAudible(mixer, 2), false);
  assert.equal(trialAudible(mixer, TRIALS.length), false);
});

test('All four timbres differ, calibrated gain is higher, and the digital output transfer stays bounded', () => {
  assert.equal(
    new Set(VOICE_PROFILES.map((v) => v.partials.join(','))).size,
    4,
  );
  assert.equal(audioLevels(frame(1, 40)).levels[0].gain, 0.1);
  assert.equal(audioLevels(frame(1, 400)).levels[0].gain, 0.2);
  for (let i = -1000; i <= 1000; i++) {
    const y = outputCurve(i / 10);
    assert.ok(Number.isFinite(y) && Math.abs(y) <= 0.95);
    if (i > -1000) assert.ok(y >= outputCurve((i - 1) / 10));
  }
  assert.equal(outputCurve(0), 0);
});

test('Measured synthetic transients schedule accents, persistence grows, and gaps cancel data cues without other-patient loss', async () => {
  const context = new AudioContextDouble(),
    mixer = new PatientMixer({
      now: () => context.currentTime,
      contextFactory: () => context,
    });
  await mixer.enable();
  mixer.begin(0);
  mixer.begin(1);
  mixer.ingest(1, frame(2));
  const accents = [],
    values = [];
  const pipeline = new FeaturePipeline((f) => {
    const previous = new Set(mixer.notes);
    mixer.ingest(0, f);
    for (const n of mixer.notes)
      if (!previous.has(n) && n.kind === 'data')
        accents.push({ end: f.end, level: n.gain.gain.events[0].value });
    values.push({ end: f.end, ...mixer.trackers[0].value });
    // Model natural oscillator completion so the double does not retain old notes.
    for (const n of [...mixer.notes])
      if (n.gain.gain.events.at(-1).time < context.currentTime)
        n.oscillator.onended();
  });
  for (let start = 0; start < 40; start += 0.5) {
    context.currentTime = start + 0.5;
    mixer.ingest(1, frame(start + 3));
    pipeline.ingest(
      {
        start,
        duration: 0.5,
        rate: 128,
        channels: patientDemoBlock(start, 0.5, 128, { slot: 0 }),
      },
      { segment: 'test' },
    );
  }
  assert.equal(
    accents.length,
    26,
    'one isolated cue and 25 repeated complexes; no script labels enter the mixer',
  );
  assert.ok(accents[0].end >= 8 && accents[0].end <= 9);
  assert.ok(
    accents.at(-1).level > accents[1].level,
    'same programmed amplitude grows more prominent with persistence',
  );
  assert.ok(
    values.find((v) => v.end === 30).emphasis >
      values.find((v) => v.end === 20).emphasis,
  );
  mixer.unavailable(0);
  assert.equal(mixer.trackers[0].value.emphasis, 0);
  assert.ok(![...mixer.notes].some((n) => n.slot === 0 && n.kind === 'data'));
  assert.equal(
    [...mixer.notes].filter((n) => n.slot === 0 && n.kind === 'status').length,
    2,
  );
  assert.equal(mixer.live.status(1), 'live');
  assert.ok(
    mixer.voices[1].voices.some((v) =>
      v.gain.gain.events.some((e) => e.value > 0),
    ),
  );
  mixer.poll();
  mixer.unavailable(0);
  assert.equal(
    [...mixer.notes].filter((n) => n.kind === 'status').length,
    2,
    'one technical cue per outage',
  );
  mixer.ingest(0, frame(41));
  assert.ok(
    ![...mixer.notes].some((n) => n.kind === 'status'),
    'recovery cancels pending loss notes',
  );
  mixer.identify(0);
  assert.ok([...mixer.notes].some((n) => n.kind === 'reference'));
  mixer.configure({ ambient: false });
  assert.equal(
    mixer.voices[0].accentGain.gain.events.find((e) => e.type === 'target')
      .value,
    0,
  );
  mixer.stop(0);
  assert.ok(![...mixer.notes].some((n) => n.slot === 0));
});

test('Listening examples include brief, sustained and simultaneous morphology with quiet calibration and release', () => {
  assert.equal(TRIAL_DURATION, 30);
  const kinds = new Set();
  for (let i = 0; i < TRIALS.length; i++) {
    const [event] = trialEvents(i);
    assert.equal(event.start, 8);
    assert.ok(event.end < TRIAL_DURATION);
    assert.deepEqual(event.slots, TRIALS[i].targets);
    kinds.add(event.type);
    assert.ok(scoreTrial(i, event.slots, 12).correct);
  }
  assert.deepEqual(kinds, new Set(['single', 'periodic', 'spike-wave']));
  assert.equal(TRIALS.filter((t) => t.targets.length === 2).length, 2);
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
