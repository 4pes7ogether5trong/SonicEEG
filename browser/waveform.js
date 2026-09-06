import { POSITIONS, parseDerivation } from './montage.js';
import { normalize } from './field-math.js';

export const WAVEFORM_POINTS = 256;
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Extrema are retained at their actual sample times. This is display compression,
// not resampling, filtering, or a new signal for spectral analysis.
export function retainWaveform(samples, rate) {
  if (!Number.isFinite(rate) || rate <= 0 || samples.length < 2 || !samples.every(Number.isFinite))
    return null;
  const n = samples.length,
    mean = samples.reduce((s, v) => s + v, 0) / n;
  let indices;
  if (n <= WAVEFORM_POINTS) indices = Array.from({ length: n }, (_, i) => i);
  else {
    indices = [0];
    const buckets = (WAVEFORM_POINTS - 2) / 2;
    for (let b = 0; b < buckets; b++) {
      const start = 1 + Math.floor((b * (n - 2)) / buckets),
        end = 1 + Math.floor(((b + 1) * (n - 2)) / buckets);
      let lo = start,
        hi = start;
      for (let i = start + 1; i < end; i++) {
        if (samples[i] < samples[lo]) lo = i;
        if (samples[i] > samples[hi]) hi = i;
      }
      indices.push(...[...new Set([lo, hi])].sort((a, b) => a - b));
    }
    indices.push(n - 1);
  }
  return {
    samples: Float32Array.from(indices, (i) => samples[i] - mean),
    times: n <= WAVEFORM_POINTS ? null : Float32Array.from(indices, (i) => i / rate),
    rate,
    duration: n / rate,
    compressed: n > WAVEFORM_POINTS,
  };
}
export function waveformSnapshot(rows, channels, start, rate) {
  const kept = channels.flatMap((c, i) => {
    const wave = c.valid && c.status !== 'expected' ? retainWaveform(rows[i].samples, rate) : null;
    return wave
      ? [{ name: c.name, status: c.status, valid: true, bands: c.bands, rms: c.rms, wave }]
      : [];
  });
  if (!kept.length) return null;
  return {
    start,
    end: start + 2,
    channels: kept,
    sharp: channels.reduce((s, c) => s + (c.sharpCount || 0), 0),
    amplitude: Math.max(...kept.map((c) => c.rms)),
  };
}
export function chooseWaveform(a, b, mixed = false) {
  if (mixed) return null;
  if (!a || !b) return a || b || null;
  // Preserve one complete, simultaneous multichannel observation. Never pick
  // different times independently for different electrodes.
  return a.sharp !== b.sharp ? (a.sharp > b.sharp ? a : b) : a.amplitude > b.amplitude ? a : b;
}
export function recentWaveforms(frames, focus, count = 6) {
  const snapshots = frames
    .filter(
      (f) => !f.mixed && !f.settingsUncertain && f.waveform && f.waveform.end <= focus + 0.001,
    )
    .map((f) => f.waveform)
    .sort((a, b) => b.end - a.end);
  const result = [];
  let before = Infinity;
  for (const w of snapshots)
    if (w.end <= before + 0.001) {
      result.push({ start: w.start, end: w.end, channels: w.channels, waveform: w });
      before = w.start;
      if (result.length === count) break;
    }
  return result.reverse();
}

export function reliefGeometry(channel, { scale = 80, radial = 1, cut = 20 } = {}) {
  const d = parseDerivation(channel.name),
    wave = channel.wave;
  if (!d || !wave || !channel.valid) return null;
  const a = normalize(POSITIONS[d.a]),
    b = d.bipolar ? normalize(POSITIONS[d.b]) : null;
  const along = normalize(Math.abs(a[0]) > 0.95 ? cross([0, 0, 1], a) : cross([1, 0, 0], a));
  const theta = b ? Math.acos(clamp(dot(a, b), -1, 1)) : 0;
  const arcSide =
    b && Math.abs(Math.sin(theta)) > 1e-5 ? normalize(cross(a, b)) : normalize(cross(a, along));
  const width = 0.055,
    cols = 3,
    positions = [],
    indices = [],
    voltage = [];
  const span = wave.duration - 1 / wave.rate;
  for (let i = 0; i < wave.samples.length; i++) {
    const u = clamp((wave.times ? wave.times[i] : i / wave.rate) / span, 0, 1);
    const point = b
      ? theta < 1e-5
        ? a
        : Math.abs(Math.sin(theta)) < 1e-5
          ? a.map((v, k) => Math.cos(u * theta) * v + Math.sin(u * theta) * along[k])
          : normalize(
              a.map(
                (v, k) =>
                  (Math.sin((1 - u) * theta) * v + Math.sin(u * theta) * b[k]) / Math.sin(theta),
              ),
            )
      : a.map((v, k) => Math.cos((u - 0.5) * 0.55) * v + Math.sin((u - 0.5) * 0.55) * along[k]);
    const side = b ? arcSide : normalize(cross(point, along));
    for (let j = 0; j < cols; j++) {
      const v = (2 * j) / (cols - 1) - 1,
        p = normalize(point.map((x, k) => x + v * width * side[k]));
      const base = [p[0], p[1] * 0.88, p[2] * 1.12],
        normal = normalize([p[0], p[1] / 0.88, p[2] / 1.12]);
      const relief =
        clamp((wave.samples[i] / Math.max(1, scale)) * 0.12, -0.16, 0.16) *
        Math.cos((v * Math.PI) / 2) ** 2;
      positions.push(base.map((x, k) => x * radial + normal[k] * relief));
      voltage.push(wave.samples[i]);
    }
  }
  for (let i = 0; i < wave.samples.length - 1; i++)
    for (let j = 0; j < cols - 1; j++) {
      const p = i * cols + j,
        q = p + cols;
      for (const tri of [
        [p, q, p + 1],
        [q, q + 1, p + 1],
      ])
        if (tri.every((k) => positions[k][0] <= cut)) indices.push(...tri);
    }
  return { positions, indices, voltage, cols };
}
