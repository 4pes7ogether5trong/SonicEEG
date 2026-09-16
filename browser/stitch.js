export class ScreenStitcher {
  constructor({ mode = 'scroll', seconds = 10 } = {}) {
    this.mode = mode;
    this.seconds = seconds;
    this.previous = null;
    this.time = 0;
  }
  push(channels, wall, cursor = null) {
    const n = channels[0]?.samples.length;
    if (!n || channels.some((c) => c.samples.length !== n))
      return { reason: 'Invalid channel geometry', gap: true };
    const prev = this.previous,
      dt = prev ? wall - prev.wall : 0,
      rate = n / this.seconds;
    const current = { channels, wall, cursor, n };
    if (!prev) {
      this.previous = current;
      return { reason: 'Anchoring capture; waiting for new screen data' };
    }
    if (dt <= 0) return { reason: 'Duplicate capture' };
    if (
      dt > Math.min(3, this.seconds * 0.6) ||
      prev.n !== n ||
      channels.map((c) => c.name).join() !==
        prev.channels.map((c) => c.name).join()
    ) {
      this.previous = current;
      this.time += dt;
      return {
        reason: 'Capture gap or layout change',
        gap: true,
        duration: dt,
      };
    }
    const good = channels
      .map((c, i) => (c.valid && prev.channels[i].valid ? i : -1))
      .filter((i) => i >= 0);
    if (good.length < Math.min(2, channels.length)) {
      this.previous = current;
      this.time += dt;
      return { reason: 'Too few reliable traces', gap: true, duration: dt };
    }
    let from, to;
    if (this.mode === 'sweep') {
      if (cursor == null || prev.cursor == null) {
        this.previous = current;
        this.time += dt;
        return { reason: 'Sweep cursor unavailable', gap: true, duration: dt };
      }
      const advance = (cursor - prev.cursor + n) % n,
        expected = rate * dt;
      if (!advance) return { reason: 'Screen has not advanced' };
      if (Math.abs(advance - expected) > Math.max(8, expected * 0.6)) {
        this.previous = current;
        this.time += dt;
        return { reason: 'Sweep timing is uncertain', gap: true, duration: dt };
      }
      // A wrap crosses an erased page; resume next capture rather than bridging old/new pixels.
      if (cursor < prev.cursor) {
        this.previous = current;
        this.time += dt;
        return { reason: 'Sweep page boundary', gap: true, duration: dt };
      }
      from = prev.cursor;
      to = cursor;
    } else {
      const cost = (shift) => {
        let err = 0,
          energy = 0,
          count = 0;
        for (const c of good.slice(0, 6))
          for (let x = 0; x < n - shift; x += 2) {
            const a = prev.channels[c].samples[x + shift],
              b = channels[c].samples[x];
            err += (a - b) ** 2;
            energy += a * a + b * b;
            count++;
          }
        return err / Math.max(energy, count * 0.5);
      };
      if (cost(0) < 0.001) return { reason: 'Screen has not advanced' };
      const expected = rate * dt,
        lo = Math.max(1, Math.floor(expected * 0.45)),
        hi = Math.min(Math.floor(n * 0.45), Math.ceil(expected * 1.6) + 3);
      let best = { shift: 0, cost: Infinity };
      const costs = [];
      for (let shift = lo; shift <= hi; shift++) {
        const e = cost(shift);
        costs.push({ shift, cost: e });
        if (e < best.cost) best = { shift, cost: e };
      }
      const competing = costs.some(
        (c) =>
          Math.abs(c.shift - best.shift) > 3 &&
          c.cost < best.cost * 1.3 + 0.002,
      );
      if (best.cost > 0.025 || competing) {
        this.previous = current;
        this.time += dt;
        return {
          reason: competing
            ? 'Ambiguous screen alignment'
            : 'Screen alignment lost',
          gap: true,
          duration: dt,
        };
      }
      from = n - best.shift;
      to = n;
    }
    this.previous = current;
    if (to <= from) return { reason: 'Waiting for a complete new column' };
    const duration = (to - from) / rate,
      start = this.time;
    this.time += duration;
    return {
      start,
      duration,
      rate,
      channels: channels.map((c) => ({
        ...c,
        samples: c.samples.slice(from, to),
        observed: c.observed?.slice(from, to),
      })),
    };
  }
}
