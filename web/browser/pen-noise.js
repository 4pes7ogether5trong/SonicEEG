import { parseDerivation, POSITIONS } from './montage.js';

// White-noise excitation, not a recording or a rhythmic backing track.
export function whiteNoise(length, seed = 1) {
  let state = seed >>> 0 || 1;
  return Float32Array.from({ length }, () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 2147483648 - 1;
  });
}

export function penColor(octave) {
  return Math.max(300, Math.min(6500, 900 * 2 ** (octave - 3)));
}

// Shared signed transfer: linear through ±80 µV, then smooth headroom instead
// of flattening the negative half-cycle at -32 µV. No per-update normalization.
export function penModulation(voltage) {
  const magnitude = Math.abs(voltage) / 80;
  const excursion =
    magnitude <= 1 ? 0.5 * magnitude : 0.5 + 0.24 * (1 - Math.exp(-(magnitude - 1) / 0.48));
  return 0.75 + Math.sign(voltage) * excursion;
}

// Use original timestamps, including extrema retained at nonuniform times.
// This is amplitude modulation at EEG speed, not accelerated audification.
export function penSegments(frame, output, previousEnd = -Infinity) {
  const snapshot = frame?.waveform;
  if (!snapshot || !output.audible || snapshot.end !== frame.end || frame.mixed) return [];
  const start = Math.max(frame.start, previousEnd, snapshot.start);
  const duration = frame.end - start;
  if (!(duration > 0)) return [];
  const candidates = snapshot.channels.filter(
    (c) =>
      c.valid &&
      c.status !== 'derived' &&
      c.status !== 'expected' &&
      c.wave?.samples?.length > 1 &&
      output.activeChannels.has(c.name),
  );
  return [-1, 1].flatMap((side) => {
    // One observed trace per side avoids summing signed traces into cancellation
    // or rectifying them into a false doubled rhythm. No phase alignment.
    const source = candidates
      .filter((c) => {
        const d = parseDerivation(c.name),
          x = d && POSITIONS[d.a]?.[0];
        return Number.isFinite(x) && (x === 0 || Math.sign(x) === side);
      })
      .sort((a, b) => (b.rms || 0) - (a.rms || 0))[0];
    if (!source) return [];
    const wave = source.wave;
    if (!(wave.rate > 0) || !wave.samples.every(Number.isFinite)) return [];
    const points = [{ time: 0, value: null }];
    let before = null;
    for (let i = 0; i < wave.samples.length; i++) {
      const time = snapshot.start + (wave.times ? wave.times[i] : i / wave.rate) - start;
      // A shared signed scale retains polarity and cycle timing. Rectifying
      // absolute voltage would make a sinusoid pulse twice each cycle.
      const value = penModulation(wave.samples[i]);
      if (!Number.isFinite(time)) return [];
      if (time <= 0) before = { time, value };
      else if (time < duration) {
        if (points[0].value === null) {
          points[0].value = before
            ? before.value + (value - before.value) * (-before.time / (time - before.time))
            : value;
        }
        points.push({ time, value });
      }
    }
    points[0].value ??= before?.value ?? 0;
    return [{ side, source: source.name, start, duration, points }];
  });
}

// Bounded playout on the audio clock. Each source interval is consumed once,
// including quiet intervals. Jitter can delay a segment, never repeat it or
// stretch its timebase. Real source gaps remain silent.
export class PenTimeline {
  constructor({ delay = 0.18, maxAhead = 2.4 } = {}) {
    this.delay = delay;
    this.maxAhead = maxAhead;
    this.reset();
  }
  reset({ keepEnd = false, now = this.now ?? 0 } = {}) {
    if (keepEnd) {
      this.prune(now);
      for (const entry of this.entries)
        if (entry.segments.length)
          this.cancelledSeconds += Math.max(0, entry.until - Math.max(entry.at, now));
    }
    if (!keepEnd) {
      this.end = -Infinity;
      this.droppedSeconds = 0;
      this.scheduledSeconds = 0;
      this.elapsedSeconds = 0;
      this.cancelledSeconds = 0;
    }
    this.now = now;
    this.offset = null;
    this.entries = [];
  }
  prune(now) {
    this.now = Math.max(this.now ?? now, now);
    for (const entry of this.entries) {
      const until = Math.max(entry.at, Math.min(entry.until, this.now));
      if (entry.segments.length) this.elapsedSeconds += Math.max(0, until - entry.accountedUntil);
      entry.accountedUntil = Math.max(entry.accountedUntil, until);
    }
    this.entries = this.entries.filter((e) => e.until > now);
  }
  append(frame, output, now, remaining) {
    this.prune(now);
    if (!Number.isFinite(frame?.end) || frame.end <= this.end) return [];
    let start = Math.max(frame.start, frame.waveform?.start ?? frame.start, this.end);
    const end = frame.end;
    this.end = end;
    if (!(end > start)) return [];
    this.offset ??= now + this.delay - start;
    if (!this.entries.length && start + this.offset > now + this.maxAhead)
      this.offset = now + this.delay - start;
    if (start + this.offset < now + 0.005) this.offset = now + 0.005 - start;
    // Never let a stalled tab build an unbounded delayed recording. Omitted
    // measured time is counted and exposed to the operator.
    const deadline = now + Math.min(remaining, this.maxAhead);
    const at = start + this.offset;
    const available = Math.min(end - start, Math.max(0, deadline - at));
    // Floating-point dust at a full deadline must not allocate queue entries.
    const duration = available >= 0.0001 ? available : 0;
    const omitted = end - start - duration;
    this.droppedSeconds += omitted;
    // Discarded samples must not reserve silent space in the future queue.
    // Close only this explicitly counted omission, never an actual source gap.
    // Otherwise one overflow pushes all following frames beyond the deadline.
    this.offset -= omitted;
    if (!(duration > 0)) return [];
    const segments = penSegments(frame, output, start).map((s) => ({
      ...s,
      duration,
      points: s.points.filter((p) => p.time < duration),
    }));
    const entry = {
      at,
      until: at + duration,
      start,
      end: start + duration,
      segments,
      state: segments.length
        ? 'playing'
        : !output.baselineReady
          ? 'baseline'
          : output.waveformReady === false || output.audible
            ? 'waiting'
            : 'quiet',
      accountedUntil: at,
    };
    if (segments.length) this.scheduledSeconds += duration;
    this.entries.push(entry);
    return [entry];
  }
  status(now) {
    this.prune(now);
    const current = this.entries.find((e) => e.at <= now && e.until > now);
    return {
      state: current?.state || (this.entries.length ? 'buffering' : 'waiting'),
      queuedSeconds: Math.max(0, (this.entries.at(-1)?.until ?? now) - now),
      droppedSeconds: this.droppedSeconds,
      scheduledSeconds: this.scheduledSeconds,
      // Audio-clock accounting, NOT proof of sound reaching the speakers. A
      // muted bus still advances its scheduled intervals without replaying.
      elapsedSeconds: this.elapsedSeconds,
      cancelledSeconds: this.cancelledSeconds,
      pendingSeconds: this.entries.reduce(
        (sum, e) => sum + (e.segments.length ? Math.max(0, e.until - Math.max(e.at, now)) : 0),
        0,
      ),
      sources: current?.segments.map((s) => s.source) || [],
    };
  }
}
