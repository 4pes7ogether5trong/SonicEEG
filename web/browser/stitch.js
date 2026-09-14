import { traceSection } from './pixels.js';
import { retainedSweep } from './sweep-retention.js';

export class ScreenStitcher {
  constructor({ mode = 'scroll', seconds = 10, cursorMargin = 0, sweepInsetPixels = 0 } = {}) {
    this.mode = mode;
    this.seconds = seconds;
    this.cursorMargin = cursorMargin;
    this.sweepInsetPixels = Math.max(0, sweepInsetPixels);
    this.awaitingSweep = null;
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
      channels.map((c) => c.name).join() !== prev.channels.map((c) => c.name).join()
    ) {
      this.awaitingSweep = null;
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
    if (this.mode !== 'sweep' && good.length < Math.min(2, channels.length)) {
      this.previous = current;
      this.time += dt;
      return { reason: 'Too few reliable traces', gap: true, duration: dt };
    }
    // Select sweep only after its cursor actually advances at the confirmed
    // timebase. A stationary colored grid line is not evidence of a sweep.
    if (this.mode === 'auto' && cursor != null && prev.cursor != null) {
      const advance = (cursor - prev.cursor + n) % n,
        expected = rate * dt;
      if (advance > 0 && Math.abs(advance - expected) <= Math.max(8, expected * 0.6))
        this.mode = 'sweep';
    }
    let from, to;
    if (this.mode === 'sweep') {
      if (this.awaitingSweep) {
        const elapsed = wall - this.awaitingSweep.wall;
        this.previous = current;
        if (elapsed <= 3 && cursor == null)
          return { reason: 'Waiting for the next sweep', expectedRedraw: true };
        if (elapsed <= 3 && cursor != null && cursor < n * 0.35) {
          this.awaitingSweep = null;
          const to = Math.max(0, cursor - this.cursorMargin);
          if (!to) return { reason: 'Waiting for new waveform columns', expectedRedraw: true };
          const start = this.time,
            duration = to / rate;
          this.time += duration;
          return { start, duration, rate, channels: channels.map((c) => traceSection(c, 0, to)) };
        }
        this.time += Math.max(0, elapsed - this.sweepInsetPixels / rate);
        this.awaitingSweep = null;
        return { reason: 'Sweep did not resume', gap: true, duration: elapsed };
      }
      if (
        prev.cursor != null &&
        prev.cursor > n * 0.75 &&
        (cursor == null || cursor < n * 0.25) &&
        (cursor == null || n - prev.cursor + cursor <= Math.max(n * 0.35, rate * dt * 3)) &&
        retainedSweep(
          prev.channels,
          channels,
          Math.max(0, prev.cursor - this.cursorMargin),
          cursor != null,
        )
      ) {
        const from = Math.max(0, prev.cursor - this.cursorMargin);
        const tail = {
          start: this.time,
          duration: (n - from) / rate,
          rate,
          channels: channels.map((c) => traceSection(c, from, n)),
          flush: true,
        };
        this.time += tail.duration;
        const gap = {
          start: this.time,
          duration: this.sweepInsetPixels / rate,
          gap: true,
          expectedRedraw: true,
        };
        this.time += gap.duration;
        const segments = [tail, gap];
        this.previous = current;
        if (cursor == null) this.awaitingSweep = { wall };
        else {
          const to = Math.max(0, cursor - this.cursorMargin);
          if (to) {
            segments.push({
              start: this.time,
              duration: to / rate,
              rate,
              channels: channels.map((c) => traceSection(c, 0, to)),
            });
            this.time += to / rate;
          }
        }
        return {
          segments,
          gap: true,
          expectedRedraw: true,
          reason: 'Completed sweep retained; next page starting',
        };
      }
      if (cursor == null || prev.cursor == null) {
        this.previous = current;
        this.time += dt;
        return { reason: 'Sweep cursor unavailable', gap: true, duration: dt };
      }
      const advance = (cursor - prev.cursor + n) % n,
        expected = rate * dt;
      if (!advance) return { reason: 'Screen has not advanced' };
      // Display redraws arrive in batches. The confirmed seconds-per-crop
      // supplies EEG time; wall-clock jitter is not a change to that timebase.
      // Still reject implausible jumps rather than append a skipped page.
      if (advance > Math.max(n * 0.35, expected * 3)) {
        this.previous = current;
        this.time += dt;
        return { reason: 'Sweep timing is uncertain', gap: true, duration: dt };
      }
      // A page that fails retention checks cannot supply a verified tail.
      if (cursor < prev.cursor) {
        this.previous = current;
        this.time += dt;
        return { reason: 'Sweep page boundary', gap: true, duration: dt };
      }
      // Read behind the refresh bar, including its antialiased edge. The bar
      // occludes the waveform; treating it as a sample poisons every window.
      from = Math.max(0, prev.cursor - this.cursorMargin);
      to = Math.max(0, cursor - this.cursorMargin);
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
        (c) => Math.abs(c.shift - best.shift) > 3 && c.cost < best.cost * 1.3 + 0.002,
      );
      if (best.cost > 0.025 || competing) {
        this.previous = current;
        this.time += dt;
        return {
          reason: competing ? 'Ambiguous screen alignment' : 'Screen alignment lost',
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
      channels: channels.map((c) => traceSection(c, from, to)),
    };
  }
}
