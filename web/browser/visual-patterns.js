import { analyze } from './signal.js';

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] || 0;

// Visual descriptors only. Work on actual uniformly sampled observations before
// waveform compression. A six-second buffer admits three cycles at 0.5 Hz.
export function deltaRhythm(samples, rate, end) {
  const absent = { strength: 0 };
  if (!(rate >= 16) || samples.length < rate * 2 || !samples.every(Number.isFinite)) return absent;
  for (const seconds of [2, 3, 4, 6]) {
    if (samples.length < seconds * rate) continue;
    const x = samples.slice(-Math.round(seconds * rate));
    const f = analyze(x, rate);
    if (f.rms < 3 || f.peakHz < 0.5 || f.peakHz >= 4 || f.bands[0] < 0.35 * f.total) continue;
    const lag = Math.round(rate / f.peakHz);
    if (lag * 3 > x.length) continue;
    const mean = x.reduce((s, v) => s + v, 0) / x.length;
    let xy = 0,
      xx = 0,
      yy = 0;
    // Require repeated shape in the recent cycles, not just an old rhythm still
    // inside the longer buffer. Frequency qualification prevents alpha aliases.
    for (let i = Math.max(lag, x.length - 2 * lag); i < x.length; i++) {
      const a = x[i] - mean,
        b = x[i - lag] - mean;
      xy += a * b;
      xx += a * a;
      yy += b * b;
    }
    const strength = xy / Math.sqrt(xx * yy || 1);
    if (strength >= 0.78) return { strength, start: end - seconds, end, hz: rate / lag };
  }
  return absent;
}

// A second route for separated broad, repeating deflections: periodicity must
// not depend on passing the sharp-transient detector. Require near-baseline gaps
// between three similarly spaced broad peaks; a continuous delta sine fails.
export function bluntRepetition(samples, rate, start) {
  const absent = { strength: 0 };
  if (!(rate >= 32) || samples.length < rate * 3 || !samples.every(Number.isFinite)) return absent;
  const center = median(samples),
    x = Array.from(samples, (v) => v - center);
  const threshold = Math.max(12, 3 * 1.4826 * median(x.map(Math.abs)));
  const radius = Math.max(1, Math.round(rate * 0.025));
  const smooth = x.map((_, i) => {
    let sum = 0,
      n = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(x.length - 1, i + radius); j++) {
      sum += x[j];
      n++;
    }
    return sum / n;
  });
  const peaks = [];
  for (let i = 1; i < smooth.length - 1; i++) {
    const a = Math.abs(smooth[i]);
    if (a < threshold || a < Math.abs(smooth[i - 1]) || a <= Math.abs(smooth[i + 1])) continue;
    let l = i,
      r = i;
    while (l > 0 && Math.abs(smooth[l]) > a / 2) l--;
    while (r < smooth.length - 1 && Math.abs(smooth[r]) > a / 2) r++;
    const width = (r - l) / rate;
    if (l === 0 || r === smooth.length - 1 || width < 0.12 || width > 0.7) continue;
    if (peaks.length && (i - peaks.at(-1).i) / rate < 0.25) continue;
    peaks.push({ i, l, r, amplitude: a });
  }
  if (peaks.length < 3) return absent;
  const last = peaks.slice(-4),
    intervals = last.slice(1).map((p, i) => (p.i - last[i].i) / rate);
  const interval = median(intervals),
    end = start + samples.length / rate;
  if (interval < 0.35 || interval > 2.5 || end - (start + last.at(-1).i / rate) > interval * 1.5)
    return absent;
  if (intervals.some((dt) => Math.abs(dt - interval) > interval * 0.2)) return absent;
  for (let i = 1; i < last.length; i++) {
    const a = last[i - 1],
      b = last[i],
      gap = smooth.slice(a.r, b.l);
    if (
      !gap.length ||
      gap.filter((v) => Math.abs(v) < Math.min(a.amplitude, b.amplitude) * 0.15).length /
        gap.length <
        0.28
    )
      return absent;
  }
  return {
    strength: 1,
    start: start + last[0].i / rate,
    end: start + last.at(-1).i / rate,
    hz: 1 / interval,
  };
}
