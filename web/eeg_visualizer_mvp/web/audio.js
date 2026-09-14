import { BANDS, clamp } from './analysis.js';
// Pitch and spatial mappings remain unchanged when the camera, age or speed changes.
export const CARRIERS = { delta: 110, theta: 220, alpha: 440, beta: 880, gamma: 1760 };
export function audioVoices(
  frame,
  { mode = 'bands', selected = null, qualityGate = true, calibrationRms = 50 } = {},
) {
  const channels =
    frame?.channels.filter(
      (c) =>
        (!selected || c.name === selected) &&
        c.voltage_calibrated &&
        c.voltage_unit === 'uV' &&
        c.spectrum?.valid &&
        (!qualityGate || !c.quality_flags?.length),
    ) || [];
  if (!channels.length) return [];
  if (mode === 'focus')
    return channels
      .slice(0, 1)
      .map((c) => ({
        id: 'focus',
        frequency: clamp(c.dominant_frequency_hz * 32, 32, 1440),
        gain: Math.min(0.18, (c.rms_amplitude / calibrationRms) * 0.09),
        pan: c.hemisphere === 'left' ? -0.7 : c.hemisphere === 'right' ? 0.7 : 0,
      }));
  const voices = [];
  for (const side of ['left', 'right', 'midline', 'unknown']) {
    const group = channels.filter((c) => c.hemisphere === side);
    if (!group.length) continue;
    for (const b of BANDS) {
      // Average power, then sqrt: acoustic amplitude tracks band RMS, not channel count.
      const power =
        group.reduce((s, c) => s + (c.band_power_absolute?.[b.key] || 0), 0) / group.length;
      voices.push({
        id: `${side}-${b.key}`,
        frequency: CARRIERS[b.key],
        gain: Math.min(0.08, (Math.sqrt(power) / calibrationRms) * 0.06),
        pan: side === 'left' ? -0.8 : side === 'right' ? 0.8 : 0,
      });
    }
  }
  return voices;
}

export class Sonifier {
  constructor() {
    this.context = null;
    this.voices = new Map();
    this.armed = false;
    this.volume = 0.25;
    this.muted = true;
  }
  async arm() {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) throw new Error('Web Audio is unavailable in this browser.');
    if (!this.context) {
      this.context = new Audio({ latencyHint: 'interactive' });
      this.master = this.context.createGain();
      this.master.gain.value = 0;
      this.limiter = this.context.createDynamicsCompressor();
      this.limiter.threshold.value = -12;
      this.limiter.knee.value = 6;
      this.limiter.ratio.value = 12;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.15;
      this.master.connect(this.limiter);
      this.limiter.connect(this.context.destination);
    }
    await this.context.resume();
    if (this.context.state !== 'running')
      throw new Error('Audio is suspended. Tap Enable sound again.');
    this.armed = true;
  }
  update(frame, options = {}) {
    if (!this.context || !this.armed) return;
    const now = this.context.currentTime,
      definitions = this.muted ? [] : audioVoices(frame, options),
      active = new Set();
    for (const d of definitions) {
      active.add(d.id);
      let v = this.voices.get(d.id);
      if (!v) {
        const oscillator = this.context.createOscillator(),
          gain = this.context.createGain(),
          pan = this.context.createStereoPanner();
        gain.gain.value = 0;
        oscillator.type = 'sine';
        oscillator.connect(gain);
        gain.connect(pan);
        pan.connect(this.master);
        oscillator.start();
        v = { oscillator, gain, pan };
        this.voices.set(d.id, v);
      }
      v.oscillator.frequency.setTargetAtTime(d.frequency, now, 0.04);
      v.gain.gain.setTargetAtTime(d.gain, now, 0.035);
      v.pan.pan.setTargetAtTime(d.pan, now, 0.04);
    }
    for (const [id, v] of this.voices)
      if (!active.has(id)) v.gain.gain.setTargetAtTime(0, now, 0.02);
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, now, 0.02);
  }
  silence() {
    this.muted = true;
    if (this.context) {
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0, now, 0.01);
    }
  }
  async close() {
    this.silence();
    for (const v of this.voices.values()) v.oscillator.stop();
    this.voices.clear();
    if (this.context) await this.context.close();
    this.context = null;
    this.armed = false;
  }
}
