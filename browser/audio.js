import {
  carrier,
  audioLevels,
  LiveAudioState,
  FRESH_SECONDS,
  VOICE_PROFILES,
  outputCurve,
} from './audio-mapping.js';
import { PatternTracker } from './patterns.js';

// Data clocks drive emphasis and accents; camera/UI clocks never do.
export class PatientMixer {
  constructor({
    now,
    contextFactory = () => new AudioContext(),
    onState = () => {},
  } = {}) {
    this.live = new LiveAudioState(now);
    this.contextFactory = contextFactory;
    this.onState = onState;
    this.enabled = false;
    this.volume = 0.28;
    this.focus = -1;
    this.spatial = 'maximum';
    this.band = -1;
    this.ambient = true;
    this.voices = [];
    this.trackers = Array.from({ length: 4 }, () => new PatternTracker());
    this.notes = new Set();
    this.lossNotified = [false, false, false, false];
  }
  wave(slot) {
    const c = this.context,
      partials = VOICE_PROFILES[slot].partials;
    const norm = Math.sqrt(partials.reduce((s, x) => s + x * x, 0));
    return c.createPeriodicWave(
      new Float32Array(partials.length + 1),
      Float32Array.from([0, ...partials.map((x) => x / norm)]),
      { disableNormalization: true },
    );
  }
  async enable() {
    if (!this.context) {
      const c = (this.context = this.contextFactory());
      this.master = c.createGain();
      this.master.gain.value = 0;
      this.compressor = c.createDynamicsCompressor();
      this.compressor.threshold.value = -8;
      this.compressor.knee.value = 8;
      this.compressor.ratio.value = 10;
      const ceiling = c.createWaveShaper();
      ceiling.curve = Float32Array.from({ length: 8193 }, (_, i) =>
        outputCurve((2 * i) / 8192 - 1),
      );
      ceiling.oversample = '2x';
      this.master.connect(this.compressor);
      this.compressor.connect(ceiling);
      ceiling.connect(c.destination);
      for (let slot = 0; slot < 4; slot++) {
        const bus = c.createGain(),
          filter = c.createBiquadFilter();
        bus.gain.value = 0;
        filter.type = 'lowpass';
        filter.Q.value = 0.5;
        filter.frequency.value = 650 * 2 ** slot;
        filter.connect(bus);
        bus.connect(this.master);
        const wave = this.wave(slot);
        const voices = audioLevels(null).levels.map(({ band, side }) => {
          const oscillator = c.createOscillator(),
            gain = c.createGain(),
            pan = c.createStereoPanner();
          oscillator.setPeriodicWave(wave);
          oscillator.frequency.value = carrier(slot, band);
          gain.gain.value = 0;
          pan.pan.value = side * 0.65;
          oscillator.connect(gain);
          gain.connect(pan);
          pan.connect(filter);
          oscillator.start();
          return { oscillator, gain, band, side };
        });
        // This separate held tone encodes emphasis, not an EEG frequency band.
        const accent = c.createOscillator(),
          accentGain = c.createGain();
        accent.setPeriodicWave(wave);
        accent.frequency.value = carrier(slot, 2);
        accentGain.gain.value = 0;
        accent.connect(accentGain);
        accentGain.connect(filter);
        accent.start();
        this.voices.push({ bus, filter, wave, voices, accentGain });
      }
      c.onstatechange = () => this.onState(c.state);
    }
    await this.context.resume();
    if (this.context.state !== 'running')
      throw new Error('The browser has not started audio.');
    this.enabled = true;
    this.master.gain.setTargetAtTime(
      this.volume,
      this.context.currentTime,
      0.08,
    );
    for (let i = 0; i < 4; i++) this.refresh(i);
    this.onState(this.context.state);
  }
  disable() {
    this.enabled = false;
    for (let i = 0; i < 4; i++)
      this.cancelNotes(i, ['data', 'status', 'reference']);
    if (this.context)
      this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.04);
  }
  begin(slot) {
    this.cancelNotes(slot, ['data', 'status', 'reference']);
    this.live.begin(slot);
    this.trackers[slot].reset();
    this.lossNotified[slot] = false;
    this.silence(slot);
  }
  stop(slot, reason = 'stopped') {
    this.cancelNotes(slot, ['data', 'status', 'reference']);
    const notify = reason === 'review' && this.live.status(slot) === 'live';
    this.live.stop(slot, reason);
    this.trackers[slot].reset({ keepBaseline: true });
    this.silence(slot);
    if (notify) this.lossCue(slot);
  }
  unavailable(slot) {
    const s = this.live.slot(slot),
      notify = s.active && !this.lossNotified[slot] && s.state === 'live';
    if (s.active) {
      s.frame = null;
      s.received = -Infinity;
      s.state = 'gap';
    }
    this.trackers[slot].reset({ keepBaseline: true });
    this.silence(slot);
    if (notify) this.lossCue(slot);
  }
  poll() {
    for (let slot = 0; slot < 4; slot++)
      if (this.live.status(slot) === 'stale' && !this.lossNotified[slot]) {
        this.trackers[slot].reset({ keepBaseline: true });
        this.silence(slot);
        this.lossCue(slot);
      }
  }
  pinBaseline(slot) {
    return (
      this.live.status(slot) === 'live' &&
      this.trackers[slot].pin(this.live.slot(slot).frame)
    );
  }
  ingest(slot, frame) {
    const before = this.live.status(slot),
      stale = before === 'stale';
    if (!this.live.ingest(slot, frame)) return;
    if (stale) this.trackers[slot].reset({ keepBaseline: true });
    if (!this.live.slot(slot).frame) {
      this.unavailable(slot);
      if (before === 'live' && !this.lossNotified[slot]) this.lossCue(slot);
      return;
    }
    if (this.lossNotified[slot]) this.cancelNotes(slot, ['status']);
    this.lossNotified[slot] = false;
    const features = this.trackers[slot].update(frame);
    this.refresh(slot);
    if (this.ambient && this.enabled) {
      for (const event of features.events.slice(0, 5)) {
        const side =
          event.sides.includes(-1) && event.sides.includes(1)
            ? 0
            : event.sides[0] || 0;
        this.note(slot, {
          level:
            0.16 *
            Math.min(1.5, event.amplitude / 80) *
            (1 + features.emphasis),
          delay: Math.max(0, event.time - (frame.end - 0.65)),
          duration: 0.14 + 0.16 * event.afterwave,
          side,
        });
      }
      if (features.changed && !features.events.length)
        this.note(slot, { level: 0.12, duration: 0.4 });
    }
  }
  cancelNotes(slot, kinds = ['data']) {
    for (const n of [...this.notes])
      if (n.slot === slot && kinds.includes(n.kind)) {
        n.gain.gain.cancelScheduledValues(this.context.currentTime);
        n.gain.gain.setTargetAtTime(0, this.context.currentTime, 0.01);
        try {
          n.oscillator.stop(this.context.currentTime + 0.06);
        } catch {}
        this.notes.delete(n);
      }
  }
  silence(slot) {
    if (!this.context) return;
    this.cancelNotes(slot);
    const now = this.context.currentTime;
    for (const node of [
      ...this.voices[slot].voices.map((v) => v.gain),
      this.voices[slot].accentGain,
    ]) {
      node.gain.cancelScheduledValues(now);
      node.gain.setTargetAtTime(0, now, 0.04);
    }
  }
  envelope(param, value, remaining, tau = 0.12) {
    const now = this.context.currentTime;
    param.cancelScheduledValues(now);
    param.setTargetAtTime(value, now, tau);
    param.setTargetAtTime(0, now + remaining, 0.04);
    param.setValueAtTime(0, now + remaining + 0.3);
  }
  refresh(slot) {
    if (!this.context) return;
    const s = this.live.slot(slot),
      now = this.context.currentTime,
      voice = this.voices[slot];
    voice.bus.gain.setTargetAtTime(
      s.muted
        ? 0
        : s.gain * (this.focus >= 0 && this.focus !== slot ? 0.25 : 1),
      now,
      0.05,
    );
    if (!this.enabled || this.live.status(slot) !== 'live') {
      this.silence(slot);
      return;
    }
    const emphasis = this.ambient ? this.trackers[slot].value.emphasis : 0;
    const remaining = Math.max(
      0,
      FRESH_SECONDS - (this.live.now() - s.received),
    );
    const { levels } = audioLevels(s.frame, this);
    voice.voices.forEach((v, i) =>
      this.envelope(
        v.gain.gain,
        levels[i].gain * (1 + 1.5 * emphasis),
        remaining,
      ),
    );
    this.envelope(
      voice.accentGain.gain,
      this.ambient ? 0.06 * emphasis : 0,
      remaining,
    );
    voice.filter.frequency.setTargetAtTime(
      Math.min(16000, 650 * 2 ** slot * (1 + 2 * emphasis)),
      now,
      0.5,
    );
  }
  configure({
    volume = this.volume,
    focus = this.focus,
    spatial = this.spatial,
    band = this.band,
    ambient = this.ambient,
  } = {}) {
    this.volume = Math.max(0, Math.min(0.8, volume));
    this.focus = focus;
    this.spatial = spatial;
    this.band = band;
    this.ambient = ambient;
    if (this.context)
      this.master.gain.setTargetAtTime(
        this.enabled ? this.volume : 0,
        this.context.currentTime,
        0.05,
      );
    if (!ambient) for (let i = 0; i < 4; i++) this.cancelNotes(i);
    for (let i = 0; i < 4; i++) this.refresh(i);
  }
  patient(slot, { gain, muted } = {}) {
    const s = this.live.slot(slot);
    if (gain != null) s.gain = Math.max(0, Math.min(1.5, gain));
    if (muted != null) s.muted = Boolean(muted);
    this.refresh(slot);
  }
  note(
    slot,
    {
      level = 0.12,
      duration = 0.35,
      delay = 0,
      side = 0,
      reference = false,
      frequency = null,
      kind = 'data',
    } = {},
  ) {
    if (!this.enabled || !this.context || this.context.state !== 'running')
      return;
    const c = this.context,
      oscillator = c.createOscillator(),
      gain = c.createGain(),
      pan = c.createStereoPanner();
    const now = c.currentTime,
      start = now + delay;
    oscillator.setPeriodicWave(this.voices[slot].wave);
    oscillator.frequency.value = frequency || carrier(slot, 2);
    gain.gain.value = 0;
    pan.pan.value = side * 0.65;
    gain.gain.setTargetAtTime(level, start, 0.008);
    gain.gain.setTargetAtTime(0, start + duration, 0.06);
    gain.gain.setValueAtTime(0, start + duration + 0.4);
    oscillator.connect(gain);
    gain.connect(pan);
    pan.connect(reference ? this.master : this.voices[slot].bus);
    const note = {
      slot,
      oscillator,
      gain,
      kind: reference ? 'reference' : kind,
    };
    this.notes.add(note);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.45);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      pan.disconnect();
      this.notes.delete(note);
    };
  }
  identify(slot) {
    this.note(slot, { level: 0.14, duration: 1.25, reference: true });
  }
  lossCue(slot) {
    this.lossNotified[slot] = true;
    // A fixed descending pair is explicitly a data-status cue, never an event.
    if (this.live.slot(slot).muted) return;
    this.note(slot, {
      level: 0.1,
      duration: 0.1,
      frequency: carrier(slot, 3),
      kind: 'status',
    });
    this.note(slot, {
      level: 0.1,
      duration: 0.1,
      delay: 0.28,
      frequency: carrier(slot, 0),
      kind: 'status',
    });
  }
}
