import { parseDerivation, POSITIONS } from './montage.js';

export const PATIENTS = Object.freeze(['A', 'B', 'C', 'D']);
export const NOTES = Object.freeze(['C', 'D', 'E', 'G', 'A']);
export const SEMITONES = Object.freeze([0, 2, 4, 7, 9]);
export const FRESH_SECONDS = 2.5;
export const OCTAVES = Object.freeze([2, 3, 4, 5, 6]);
export const VOICE_PROFILES = Object.freeze([
  { name: 'Velvet', partials: [1, 0.65, 0.18, 0.06] },
  { name: 'Hollow', partials: [1, 0, 0.65, 0, 0.2] },
  { name: 'Reed', partials: [1, 0.6, 0.42, 0.28, 0.14] },
  { name: 'Glass', partials: [1, 0.1, 0.04, 0.25] },
]);
export const outputCurve = (x) => 0.95 * Math.tanh(x / 0.95);

export function carrier(slot, band, octave = slot + 3) {
  if (
    !Number.isInteger(slot) ||
    slot < 0 ||
    slot >= 4 ||
    !Number.isInteger(band) ||
    band < 0 ||
    band >= 5 ||
    !OCTAVES.includes(octave)
  )
    throw new RangeError('Four patients, five frequency bands and octaves 2–6 are supported.');
  return 130.8127826502993 * 2 ** (octave - 3 + SEMITONES[band] / 12);
}

// One shared voltage scale. A maximum preserves focal contributions that a
// mean can dilute. Derived channels do not double-count observations.
export function audioLevels(
  frame,
  { spatial = 'maximum', band = -1, mode = 'continuous', threshold = 0, baseline = null } = {},
) {
  const observed =
    frame?.channels?.filter((c) => c.valid && c.status !== 'derived' && c.status !== 'expected') ||
    [];
  const levels = [],
    activeChannels = new Set();
  const changes = mode === 'changes';
  const baselineReady = !changes || observed.some((c) => baseline?.has(c.name));
  for (let b = 0; b < 5; b++)
    for (const side of [-1, 1]) {
      const powers = observed
        .filter((c) => {
          const d = parseDerivation(c.name);
          const x = d && POSITIONS[d.a]?.[0];
          return Number.isFinite(x) && (x === 0 || Math.sign(x) === side);
        })
        .map((c) => {
          const power = c.bands?.[b];
          if (!Number.isFinite(power) || power < 0) return null;
          const rms = Math.sqrt(power),
            ref = baseline?.get(c.name)?.[b];
          let audibleRms = Math.max(0, rms - threshold);
          if (changes) {
            if (!Number.isFinite(ref)) return null;
            const db = Math.abs(20 * Math.log10((rms + 2) / (ref + 2)));
            // A 3 dB transition above the threshold avoids a hard on/off step.
            // Absolute RMS difference also makes attenuation audible.
            audibleRms = Math.abs(rms - ref) * Math.max(0, Math.min(1, (db - threshold) / 3));
          }
          if (audibleRms > 0 && (band < 0 || band === b)) activeChannels.add(c.name);
          return audibleRms ** 2;
        })
        .filter((p) => Number.isFinite(p) && p >= 0);
      const power = !powers.length
        ? 0
        : spatial === 'mean'
          ? powers.reduce((a, p) => a + p, 0) / powers.length
          : Math.max(...powers);
      const rms = Math.sqrt(power);
      levels.push({
        band: b,
        side,
        rms,
        gain: band >= 0 && band !== b ? 0 : 0.1 * Math.min(2, rms / 40),
      });
    }
  return {
    levels,
    valid: observed.length > 0,
    channels: observed.length,
    baselineReady,
    activeChannels,
    audible: levels.some((l) => l.gain > 0),
  };
}

export class LiveAudioState {
  constructor(now = () => performance.now() / 1000) {
    this.now = now;
    this.slots = PATIENTS.map((_, slot) => ({
      active: false,
      end: -Infinity,
      received: -Infinity,
      frame: null,
      gain: 1,
      muted: false,
      octave: slot + 3,
      soundMode: 'continuous',
      amplitudeThreshold: 0,
      changeThreshold: 6,
      state: 'idle',
    }));
  }
  slot(index) {
    if (!Number.isInteger(index) || !this.slots[index])
      throw new RangeError('Unknown patient slot');
    return this.slots[index];
  }
  begin(index) {
    Object.assign(this.slot(index), {
      active: true,
      end: -Infinity,
      received: -Infinity,
      frame: null,
      state: 'waiting',
    });
  }
  stop(index, reason = 'stopped') {
    Object.assign(this.slot(index), {
      active: false,
      frame: null,
      received: -Infinity,
      state: reason,
    });
  }
  ingest(index, frame) {
    const s = this.slot(index);
    if (!s.active || !Number.isFinite(frame?.end) || frame.end <= s.end) return false;
    s.end = frame.end;
    const valid = !frame.mixed && audioLevels(frame).valid;
    s.frame = valid ? frame : null;
    s.received = valid ? this.now() : -Infinity;
    s.state = valid ? 'live' : 'gap';
    return true;
  }
  status(index) {
    const s = this.slot(index);
    return s.state === 'live' && this.now() - s.received >= FRESH_SECONDS ? 'stale' : s.state;
  }
}
