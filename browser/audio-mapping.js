import { parseDerivation, POSITIONS } from './montage.js';

export const PATIENTS = Object.freeze(['A', 'B', 'C', 'D']);
export const NOTES = Object.freeze(['C', 'D', 'E', 'G', 'A']);
export const SEMITONES = Object.freeze([0, 2, 4, 7, 9]);
export const FRESH_SECONDS = 2.5;

export function carrier(slot, band) {
  if (
    !Number.isInteger(slot) ||
    slot < 0 ||
    slot >= 4 ||
    !Number.isInteger(band) ||
    band < 0 ||
    band >= 5
  )
    throw new RangeError(
      'Four patients and five frequency bands are supported.',
    );
  return 130.8127826502993 * 2 ** (slot + SEMITONES[band] / 12);
}

// One shared voltage scale. A maximum preserves focal contributions that a
// mean can dilute. Derived channels do not double-count observations.
export function audioLevels(frame, { spatial = 'maximum', band = -1 } = {}) {
  const observed =
    frame?.channels?.filter(
      (c) => c.valid && c.status !== 'derived' && c.status !== 'expected',
    ) || [];
  const levels = [];
  for (let b = 0; b < 5; b++)
    for (const side of [-1, 1]) {
      const powers = observed
        .filter((c) => {
          const d = parseDerivation(c.name);
          const x = d && POSITIONS[d.a]?.[0];
          return Number.isFinite(x) && (x === 0 || Math.sign(x) === side);
        })
        .map((c) => c.bands?.[b])
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
        gain: band >= 0 && band !== b ? 0 : 0.018 * Math.min(2, rms / 40),
      });
    }
  return { levels, valid: observed.length > 0, channels: observed.length };
}

export class LiveAudioState {
  constructor(now = () => performance.now() / 1000) {
    this.now = now;
    this.slots = PATIENTS.map(() => ({
      active: false,
      end: -Infinity,
      received: -Infinity,
      frame: null,
      gain: 1,
      muted: false,
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
    if (!s.active || !Number.isFinite(frame?.end) || frame.end <= s.end)
      return false;
    s.end = frame.end;
    const valid = !frame.mixed && audioLevels(frame).valid;
    s.frame = valid ? frame : null;
    s.received = valid ? this.now() : -Infinity;
    s.state = valid ? 'live' : 'gap';
    return true;
  }
  status(index) {
    const s = this.slot(index);
    return s.state === 'live' && this.now() - s.received >= FRESH_SECONDS
      ? 'stale'
      : s.state;
  }
}
