import {
  carrier,
  audioLevels,
  LiveAudioState,
  FRESH_SECONDS,
} from './audio-mapping.js';

// Only a new acquisition interval may refresh a voice. Expiry runs on the
// audio clock even if the page stalls; controls never extend that deadline.
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
    this.volume = 0.35;
    this.focus = -1;
    this.spatial = 'maximum';
    this.band = -1;
    this.voices = [];
  }
  async enable() {
    if (!this.context) {
      const c = (this.context = this.contextFactory());
      this.master = c.createGain();
      this.master.gain.value = 0;
      const compressor = c.createDynamicsCompressor();
      compressor.threshold.value = -6;
      compressor.knee.value = 6;
      compressor.ratio.value = 8;
      this.master.connect(compressor);
      compressor.connect(c.destination);
      for (let slot = 0; slot < 4; slot++) {
        const bus = c.createGain();
        bus.gain.value = 0;
        bus.connect(this.master);
        const wave = c.createPeriodicWave(
          new Float32Array(5),
          new Float32Array([
            0,
            1,
            [0, 0.035, 0.065, 0.09][slot],
            [0, 0.06, 0.025, 0.07][slot],
            0,
          ]),
        );
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
          pan.connect(bus);
          oscillator.start();
          return { oscillator, gain, band, side };
        });
        this.voices.push({ bus, voices });
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
      0.05,
    );
    for (let i = 0; i < 4; i++) this.refresh(i);
    this.onState(this.context.state);
  }
  disable() {
    this.enabled = false;
    if (this.context)
      this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.04);
  }
  begin(slot) {
    this.live.begin(slot);
    this.silence(slot);
  }
  stop(slot, reason = 'stopped') {
    this.live.stop(slot, reason);
    this.silence(slot);
  }
  unavailable(slot) {
    const s = this.live.slot(slot);
    if (s.active) {
      s.frame = null;
      s.received = -Infinity;
      s.state = 'gap';
    }
    this.silence(slot);
  }
  ingest(slot, frame) {
    if (this.live.ingest(slot, frame)) this.refresh(slot);
  }
  silence(slot) {
    if (!this.context) return;
    for (const v of this.voices[slot].voices) {
      const p = v.gain.gain,
        now = this.context.currentTime;
      p.cancelScheduledValues(now);
      p.setTargetAtTime(0, now, 0.04);
    }
  }
  refresh(slot) {
    if (!this.context) return;
    const s = this.live.slot(slot),
      now = this.context.currentTime;
    const bus = this.voices[slot].bus.gain;
    // Focus lowers other patients by 12 dB; explicit Mute remains separate.
    bus.setTargetAtTime(
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
    const { levels } = audioLevels(s.frame, this);
    const remaining = Math.max(
      0,
      FRESH_SECONDS - (this.live.now() - s.received),
    );
    this.voices[slot].voices.forEach((v, i) => {
      const p = v.gain.gain;
      p.cancelScheduledValues(now);
      p.setTargetAtTime(levels[i].gain, now, 0.08);
      p.setTargetAtTime(0, now + remaining, 0.04);
      p.setValueAtTime(0, now + remaining + 0.3);
    });
  }
  configure({
    volume = this.volume,
    focus = this.focus,
    spatial = this.spatial,
    band = this.band,
  } = {}) {
    this.volume = Math.max(0, Math.min(0.5, volume));
    this.focus = focus;
    this.spatial = spatial;
    this.band = band;
    if (this.context)
      this.master.gain.setTargetAtTime(
        this.enabled ? this.volume : 0,
        this.context.currentTime,
        0.05,
      );
    for (let i = 0; i < 4; i++) this.refresh(i);
  }
  patient(slot, { gain, muted } = {}) {
    const s = this.live.slot(slot);
    if (gain != null) s.gain = Math.max(0, Math.min(1.5, gain));
    if (muted != null) s.muted = Boolean(muted);
    this.refresh(slot);
  }
  identify(slot) {
    if (!this.enabled || !this.context) return;
    const c = this.context,
      oscillator = c.createOscillator(),
      gain = c.createGain(),
      now = c.currentTime;
    oscillator.frequency.value = carrier(slot, 0);
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.08, now, 0.015);
    gain.gain.setTargetAtTime(0, now + 0.35, 0.035);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start();
    oscillator.stop(now + 0.65);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }
}
