// A separate capture diagnostic, never an input to analysis, baseline or sound.
// It records only newly stitched columns, including fragments too short for a
// complete analysis window. Ink visibility is not proof of channel identity.
export function traceBlock(block, { segment, settings, negativeUp = true } = {}) {
  return {
    start: block.start,
    end: block.start + block.duration,
    rate: block.rate,
    segment,
    settings,
    negativeUp,
    channels: (block.channels || []).map((c) => ({
      name: c.name,
      samples: c.samples,
      observed: Uint8Array.from(c.samples, (v, i) =>
        !Number.isFinite(v) || c.clippedPixels?.[i]
          ? 0
          : (c.observed?.[i] ?? (c.valid === false ? 0 : 1)),
      ),
    })),
  };
}

export class TraceMonitor {
  constructor(names = [], start = 0) {
    this.reset(names, start);
  }
  reset(names = [], start = 0) {
    this.start = this.end = start;
    this.rows = new Map();
    this.checkpoints = [];
    this.context = null;
    this.negativeUp = true;
    this.expect(names);
  }
  expect(names) {
    for (const name of names)
      if (!this.rows.has(name))
        this.rows.set(name, {
          name,
          ink: 0,
          repaired: 0,
          lastReadable: this.start,
          longestGap: 0,
          current: false,
          fragments: [],
        });
  }
  ingest(block) {
    if (!Number.isFinite(block?.end) || !(block.end > block.start) || block.end <= this.end) return;
    this.checkpoints.push({
      end: this.end,
      rows: new Map([...this.rows].map(([n, r]) => [n, { ...r, fragments: [] }])),
    });
    this.checkpoints = this.checkpoints.filter((c) => c.end >= block.end - 12).slice(-128);
    this.expect(block.channels.map((c) => c.name));
    const context = JSON.stringify([block.segment, block.settings, block.negativeUp !== false]);
    if (this.context !== context) {
      for (const row of this.rows.values()) row.fragments = [];
      this.context = context;
      this.negativeUp = block.negativeUp !== false;
    }
    const channels = new Map(block.channels.map((c) => [c.name, c]));
    const from = Math.max(this.end, block.start),
      to = block.end;
    for (const row of this.rows.values()) {
      row.current = false;
      const c = channels.get(row.name),
        rate = block.rate;
      if (c && rate > 0 && Number.isFinite(rate)) {
        const first = Math.max(0, Math.floor((from - block.start) * rate + 1e-7));
        for (let i = first; i < c.samples.length; i++) {
          const a = Math.max(from, block.start + i / rate);
          const b = Math.min(to, block.start + (i + 1) / rate);
          if (!(b > a) || !c.observed[i] || !Number.isFinite(c.samples[i])) continue;
          row.longestGap = Math.max(row.longestGap, a - row.lastReadable);
          row.lastReadable = b;
          if (c.observed[i] === 2) row.repaired += b - a;
          else row.ink += b - a;
          row.current = true;
        }
        // Keep native samples in a small rolling inspection window. Hard caps
        // bound unusually dense/rapid sources; evicted time stays hatched.
        const begin = Math.max(
          first,
          Math.ceil((to - 4 - block.start) * rate),
          c.samples.length - 4096,
        );
        if (begin < c.samples.length)
          row.fragments.push({
            start: block.start + begin / rate,
            end: to,
            rate,
            samples: c.samples.slice(begin),
            observed: c.observed.slice(begin),
          });
      }
      row.fragments = row.fragments.filter((f) => f.end > to - 4).slice(-64);
      let count = 0;
      row.fragments = row.fragments
        .reverse()
        .filter((f) => (count += f.samples.length) <= 4096)
        .reverse();
    }
    this.end = to;
  }
  invalidateSince(time) {
    const end = this.end,
      names = [...this.rows.keys()];
    const checkpoint = this.checkpoints.findLast((c) => c.end <= time);
    if (!checkpoint) return this.reset(names, end);
    this.rows = checkpoint.rows;
    this.end = checkpoint.end;
    this.checkpoints = this.checkpoints.filter((c) => c.end < this.end);
    this.expect(names);
    this.ingest({ start: this.end, end, channels: [] });
  }
  snapshot(extraGap = 0) {
    const end = this.end + Math.max(0, extraGap),
      elapsed = end - this.start;
    return [...this.rows.values()].map((r) => ({
      ...r,
      elapsed,
      end,
      negativeUp: this.negativeUp,
      current: r.current && !extraGap,
      percent: elapsed > 0 ? (100 * r.ink) / elapsed : 0,
      longestGap: Math.max(r.longestGap, end - r.lastReadable),
    }));
  }
}

// Do not connect across missing columns, even when adjacent fragments happen
// to end at the same voltage. Repaired raster breaks remain separately colored.
export function traceRuns(row, from, to) {
  const runs = [];
  for (const fragment of row.fragments) {
    let run = null;
    for (let i = 0; i < fragment.samples.length; i++) {
      const time = fragment.start + i / fragment.rate;
      const kind = fragment.observed[i],
        value = fragment.samples[i];
      if (time < from || time >= to || !kind || !Number.isFinite(value)) {
        run = null;
        continue;
      }
      if (!run || run.kind !== kind) {
        run = { kind, points: [] };
        runs.push(run);
      }
      run.points.push({ time, value });
    }
  }
  return runs;
}
