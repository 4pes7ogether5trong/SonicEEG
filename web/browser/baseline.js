// A fixed within-recording reference. No normative or seizure probability model.
export const CHANGE_DB = 6;
const context = (f) => JSON.stringify([f.source, f.segment, f.settings]);
export class BaselineWindow {
  constructor(seconds = 20, minimum = 3) {
    this.seconds = seconds;
    this.minimum = minimum;
    this.clear();
  }
  clear() {
    this.frames = [];
    this.key = null;
    this.lastEnd = -Infinity;
  }
  ingest(frame) {
    if (context(frame) !== this.key || frame.mixed) {
      this.clear();
      this.key = context(frame);
    }
    if (frame.mixed || frame.end <= this.lastEnd) return;
    const start = Math.max(frame.start, this.lastEnd, frame.waveform?.start ?? frame.start);
    this.lastEnd = frame.end;
    this.frames.push({
      start,
      end: frame.end,
      channels: frame.gaps
        ? []
        : frame.channels
            .filter(
              (c) =>
                c.valid &&
                c.status === 'observed' &&
                c.bands?.length === 5 &&
                c.bands.every((p) => Number.isFinite(p) && p >= 0),
            )
            .map((c) => ({
              name: c.name,
              rms: c.bands.map(Math.sqrt),
              seconds: Math.min(c.validSeconds ?? frame.end - start, frame.end - start),
            })),
    });
    this.frames = this.frames.filter((f) => f.end > frame.end - this.seconds).slice(-128);
  }
  reference(frame) {
    if (!frame || frame.mixed || context(frame) !== this.key) return null;
    const start = Math.max(this.frames[0]?.start ?? frame.end, frame.end - this.seconds);
    const byName = new Map();
    for (const f of this.frames)
      for (const c of f.channels) {
        const weight = Math.max(0, Math.min(c.seconds, f.end - Math.max(start, f.start)));
        if (!weight) continue;
        const values = byName.get(c.name) || [];
        values.push({ rms: c.rms, weight });
        byName.set(c.name, values);
      }
    const channels = [];
    for (const [name, values] of byName) {
      const seconds = values.reduce((s, v) => s + v.weight, 0);
      if (seconds + 1e-6 < this.minimum) continue;
      const bands = Array.from({ length: 5 }, (_, b) => {
        let sum = 0;
        for (const v of [...values].sort((a, c) => a.rms[b] - c.rms[b])) {
          sum += v.weight;
          if (sum >= seconds / 2) return v.rms[b] ** 2;
        }
      });
      channels.push({ name, bands, valid: true, status: 'observed', validSeconds: seconds });
    }
    return channels.length
      ? {
          source: frame.source,
          segment: frame.segment,
          settings: frame.settings,
          start,
          end: frame.end,
          channels,
          minimum: this.minimum,
        }
      : null;
  }
}
export class BaselineMap {
  constructor() {
    this.serial = 0;
    this.clear();
  }
  clear() {
    this.reference = null;
    this.key = null;
  }
  pin(frame) {
    const channels = frame?.channels.filter((c) => c.valid && c.status === 'observed') || [];
    if (!channels.length || frame.mixed) return false;
    this.reference = new Map(channels.map((c) => [c.name, c.bands.map((p) => Math.sqrt(p))]));
    this.key = context(frame);
    this.id = this.key + ':' + frame.end + ':' + ++this.serial;
    return true;
  }
  apply(frame) {
    if (!this.reference) return;
    if (frame.mixed || context(frame) !== this.key) {
      this.clear();
      return;
    }
    for (const c of frame.channels) {
      const ref = this.reference.get(c.name);
      if (!c.valid || !ref || c.status !== 'observed') continue;
      const dt = c.validSeconds || 0;
      // The 2 µV floor prevents near-zero band power from exploding into huge ratios.
      const db = c.bands.map((p, b) => 20 * Math.log10((Math.sqrt(p) + 2) / (ref[b] + 2)));
      c.baseline = {
        id: this.id,
        validSeconds: dt,
        dbSums: db.map((v) => v * dt),
        changedSeconds: db.map((v) => (Math.abs(v) >= CHANGE_DB ? dt : 0)),
        anyChangedSeconds: db.some((v) => Math.abs(v) >= CHANGE_DB) ? dt : 0,
      };
    }
  }
}
export function mergeBaseline(a, b) {
  if (!a && !b) return null;
  if (a?.mixed || b?.mixed || (a && b && a.id !== b.id)) return { mixed: true, validSeconds: 0 };
  const x = a || b,
    y = a && b ? b : null;
  return {
    id: x.id,
    validSeconds: x.validSeconds + (y?.validSeconds || 0),
    anyChangedSeconds: (x.anyChangedSeconds || 0) + (y?.anyChangedSeconds || 0),
    dbSums: x.dbSums.map((v, i) => v + (y?.dbSums[i] || 0)),
    changedSeconds: x.changedSeconds.map((v, i) => v + (y?.changedSeconds[i] || 0)),
  };
}
