import { parseDerivation, POSITIONS } from './montage.js';

const clamp = (x) => Math.max(0, Math.min(1, x));
export const EMPHASIS_LANDMARK_SECONDS = 10;
export function persistenceEmphasis(seconds, recurrence) {
  const early = 0.35 * clamp(seconds / EMPHASIS_LANDMARK_SECONDS);
  const sustained =
    seconds >= EMPHASIS_LANDMARK_SECONDS
      ? 0.45 * (1 - Math.exp(-(seconds - EMPHASIS_LANDMARK_SECONDS) / 6))
      : 0;
  return clamp(early + sustained + 0.2 * clamp(recurrence));
}
const median = (values) => {
  const a = [...values].sort((x, y) => x - y);
  return a.length ? (a[Math.floor((a.length - 1) / 2)] + a[Math.floor(a.length / 2)]) / 2 : 0;
};

// Engineering descriptors, NOT a spike/PD/seizure classifier. The displayed
// waveform must supply enough samples; filtering and artifacts remain limits.
export function transientFeatures(samples, rate, start) {
  if (rate < 100 || samples.length < rate * 0.5 || !samples.every(Number.isFinite))
    return { available: false, events: [] };
  const center = median(samples),
    x = Array.from(samples, (v) => v - center);
  const threshold = Math.max(16, 2.8 * 1.4826 * median(x.map(Math.abs)));
  const radius = Math.ceil(rate * 0.12),
    curvatureStep = Math.max(1, Math.round(rate / 64)),
    events = [];
  for (let i = radius; i < x.length - radius; i++) {
    const a = Math.abs(x[i]);
    if (a < threshold || a < Math.abs(x[i - 1]) || a <= Math.abs(x[i + 1])) continue;
    let left = i,
      right = i;
    while (
      left > i - radius &&
      Math.abs(x[left]) > a * 0.5 &&
      Math.sign(x[left]) === Math.sign(x[i])
    )
      left--;
    while (
      right < i + radius &&
      Math.abs(x[right]) > a * 0.5 &&
      Math.sign(x[right]) === Math.sign(x[i])
    )
      right++;
    const width = (right - left) / rate;
    if (
      width < 0.012 ||
      width > 0.09 ||
      Math.abs(x[i - curvatureStep] - 2 * x[i] + x[i + curvatureStep]) < a * 0.75
    )
      continue;
    const time = start + i / rate;
    if (events.length && time - events.at(-1).time < 0.12) continue;
    const tail = x.slice(
      i + Math.ceil(rate * 0.04),
      Math.min(x.length, i + Math.ceil(rate * 0.22)),
    );
    const afterwave = Math.max(0, ...tail.map((v) => -Math.sign(x[i]) * v)) / a;
    events.push({ time, amplitude: a, width, afterwave: clamp(afterwave) });
  }
  return { available: true, threshold, events };
}

export class PatternTracker {
  constructor() {
    this.reset();
  }
  reset({ keepBaseline = false } = {}) {
    if (!keepBaseline) {
      this.baseline = null;
      this.baselineContext = null;
    }
    this.seen = new Map();
    this.recent = [];
    this.lastEnd = null;
    this.context = null;
    this.run = 0;
    this.sequenceOnset = null;
    this.deviationOnset = null;
    this.memory = 0;
    this.value = {
      emphasis: 0,
      persistence: 0,
      recurrence: 0,
      regularity: 0,
      repetitionHz: 0,
      distribution: 'none',
      events: [],
      baseline: Boolean(this.baseline),
      available: false,
    };
  }
  pin(frame) {
    const valid = frame?.channels?.filter((c) => c.valid && c.status === 'observed');
    if (!valid?.length || frame.mixed) return false;
    this.baseline = new Map(valid.map((c) => [c.name, c.bands.map((p) => Math.sqrt(p))]));
    this.baselineContext = JSON.stringify([frame.source, frame.segment, frame.settings]);
    this.value.baseline = true;
    this.value.deviation = 0;
    this.value.changed = false;
    this.deviationOnset = null;
    return true;
  }
  update(frame) {
    if (!Number.isFinite(frame?.end) || frame.end <= (this.lastEnd ?? -Infinity)) return this.value;
    const context = JSON.stringify([frame.source, frame.segment, frame.settings]);
    // A gap may clear the temporal context, but never makes a reference from
    // another montage/filter/scale segment comparable to the new recording.
    if (this.baseline && this.baselineContext !== context) this.reset();
    const rows = frame.channels.filter((c) => c.valid && c.status === 'observed');
    if (frame.mixed || !rows.length) {
      this.reset({ keepBaseline: true });
      return this.value;
    }
    if (this.context != null && this.context !== context) this.reset();
    if (this.lastEnd != null && frame.start - this.lastEnd > 0.1)
      this.reset({ keepBaseline: true });
    this.context = context;
    const dt =
      this.lastEnd == null
        ? Math.min(0.5, frame.end - frame.start)
        : Math.min(1, frame.end - this.lastEnd);
    this.lastEnd = frame.end;
    const fresh = [];
    let deviation = 0,
      available = false;
    for (const c of rows) {
      available ||= Boolean(c.transients?.available);
      const prior = this.seen.get(c.name) ?? -Infinity;
      const d = parseDerivation(c.name),
        side = Math.sign(POSITIONS[d?.a]?.[0] || 0);
      for (const e of c.transients?.events || []) {
        if (e.time <= prior + 0.035 || e.time < frame.end - 2.1) continue;
        fresh.push({ ...e, name: c.name, side });
        this.seen.set(c.name, Math.max(this.seen.get(c.name) ?? -Infinity, e.time));
      }
      const base = this.baseline?.get(c.name);
      if (base)
        c.bands.forEach((p, i) => {
          // Symmetric sensitivity to attenuation and increased amplitude, with
          // a fixed 2 µV floor. The reference NEVER rolls toward a new pattern.
          deviation = Math.max(
            deviation,
            clamp((Math.abs(Math.log2((Math.sqrt(p) + 2) / (base[i] + 2))) - 0.65) / 1.5),
          );
        });
    }
    const clusters = [];
    for (const e of fresh.sort((a, b) => a.time - b.time)) {
      const previous = clusters.at(-1);
      if (previous && e.time - previous.time < 0.07) {
        previous.amplitude = Math.max(previous.amplitude, e.amplitude);
        previous.afterwave = Math.max(previous.afterwave, e.afterwave);
        if (!previous.sides.includes(e.side)) previous.sides.push(e.side);
        previous.channels.push(e.name);
      } else clusters.push({ ...e, sides: [e.side], channels: [e.name] });
    }
    // Cross-channel boundary detections must not create a second audible beat.
    const events = clusters.filter(
      (e) => !this.recent.some((old) => Math.abs(old.time - e.time) < 0.09),
    );
    this.recent.push(...events);
    this.recent = this.recent.filter((e) => e.time >= frame.end - 12);
    let sequence = this.recent;
    for (let i = 1; i < this.recent.length; i++)
      if (this.recent[i].time - this.recent[i - 1].time > 3) {
        sequence = this.recent.slice(i);
        this.sequenceOnset = null;
      }
    const intervals = sequence.slice(1).map((e, i) => e.time - sequence[i].time);
    const interval = median(intervals);
    const regularity =
      intervals.length >= 2
        ? clamp(
            1 -
              (median(intervals.map((x) => Math.abs(x - interval))) / Math.max(0.02, interval)) * 2,
          )
        : 0;
    const repeated =
      sequence.length >= 3 &&
      frame.end - sequence.at(-1).time < Math.min(3, Math.max(1.2, interval * 1.8));
    if (repeated) this.sequenceOnset ??= sequence[0].time;
    const sharpSeconds = repeated ? Math.max(0, sequence.at(-1).time - this.sequenceOnset) : 0;
    if (!repeated) this.sequenceOnset = null;
    // An expired train cannot be joined to a later burst merely because its
    // old candidates are still in the short history. Recurrence remains separate.
    if (sequence.length >= 3 && !repeated) this.recent = [];
    if (deviation > 0.35) this.deviationOnset ??= frame.start;
    else this.deviationOnset = null;
    const deviationSeconds = this.deviationOnset == null ? 0 : frame.end - this.deviationOnset;
    const ongoing = repeated || deviation > 0.35;
    this.run = Math.max(sharpSeconds, deviationSeconds);
    const target = ongoing || events.length ? 1 : 0;
    this.memory += (target - this.memory) * (1 - Math.exp(-dt / (target ? 10 : 18)));
    const desired = persistenceEmphasis(this.run, this.memory);
    const emphasis =
      desired > this.value.emphasis ? desired : this.value.emphasis * Math.exp(-dt / 6);
    const sides = new Set(
      this.recent.filter((e) => frame.end - e.time < 3).flatMap((e) => e.sides),
    );
    const changed = deviation > 0.35 && !(this.value.deviation > 0.35);
    this.value = {
      emphasis: clamp(emphasis),
      persistence: this.run,
      sharpSeconds,
      deviationSeconds,
      sustained: this.run >= EMPHASIS_LANDMARK_SECONDS,
      recurrence: this.memory,
      regularity,
      changed,
      repetitionHz: repeated && interval > 0 ? 1 / interval : 0,
      distribution:
        sides.has(-1) && sides.has(1)
          ? 'bilateral'
          : sides.has(-1)
            ? 'left'
            : sides.has(1)
              ? 'right'
              : sides.has(0)
                ? 'midline'
                : 'none',
      events: events.filter((e) => e.time >= frame.end - 0.7),
      deviation,
      baseline: Boolean(this.baseline),
      available,
    };
    return this.value;
  }
}
