// Analysis-usable time, not frame counts or a claim of full scalp coverage.
// Constant storage per confirmed derivation; gaps never enter the numerator.
export class ChannelCoverage {
  constructor(names = [], start = 0) {
    this.reset(names, start);
  }
  reset(names = [], start = 0) {
    this.start = start;
    this.end = start;
    this.rows = new Map();
    this.checkpoints = [];
    this.expect(names);
  }
  expect(names) {
    for (const name of names)
      if (!this.rows.has(name))
        this.rows.set(name, {
          name,
          usable: 0,
          lastUsable: this.start,
          longestGap: 0,
          current: false,
        });
  }
  ingest(frame) {
    if (!Number.isFinite(frame?.end) || frame.end <= this.end || !(frame.end > frame.start)) return;
    this.checkpoints.push({
      end: this.end,
      rows: new Map([...this.rows].map(([n, r]) => [n, { ...r }])),
    });
    this.checkpoints = this.checkpoints.filter((c) => c.end >= frame.end - 12).slice(-128);
    this.expect(frame.channels.filter((c) => c.status !== 'derived').map((c) => c.name));
    const from = Math.max(this.end, frame.start),
      to = frame.end;
    const channels = new Map(frame.channels.map((c) => [c.name, c]));
    for (const row of this.rows.values()) {
      const c = channels.get(row.name);
      const usableStart = Math.max(from, frame.waveform?.start ?? from);
      const seconds =
        !frame.mixed && !frame.gaps && c?.valid && c.status === 'observed'
          ? Math.min(to - usableStart, c.validSeconds ?? to - usableStart)
          : 0;
      row.current = seconds > 0;
      if (seconds > 0) {
        // A partial duration without sample positions is conservatively placed
        // at the interval's end, so its preceding unknown time remains a gap.
        row.longestGap = Math.max(row.longestGap, to - seconds - row.lastUsable);
        row.usable += seconds;
        row.lastUsable = to;
      }
    }
    this.end = to;
  }
  invalidateSince(time) {
    const end = this.end,
      names = [...this.rows.keys()];
    const checkpoint = this.checkpoints.findLast((c) => c.end <= time);
    if (!checkpoint) {
      this.reset(names, end);
      return;
    }
    this.rows = checkpoint.rows;
    this.end = checkpoint.end;
    this.checkpoints = this.checkpoints.filter((c) => c.end < this.end);
    this.expect(names);
    this.ingest({ start: this.end, end, channels: [], gaps: end - this.end });
  }
  snapshot(extraGap = 0) {
    const end = this.end + Math.max(0, extraGap),
      elapsed = end - this.start;
    return [...this.rows.values()].map((r) => ({
      ...r,
      current: r.current && !extraGap,
      elapsed,
      percent: elapsed > 0 ? (100 * r.usable) / elapsed : 0,
      gap: Math.max(0, end - r.lastUsable),
      longestGap: Math.max(r.longestGap, end - r.lastUsable),
    }));
  }
}
