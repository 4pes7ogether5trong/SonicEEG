// A fixed within-recording reference. No normative or seizure probability model.
export const CHANGE_DB = 6;
const context = (f) => JSON.stringify([f.source, f.segment, f.settings]);
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
