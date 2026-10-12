import { POSITIONS, parseDerivation } from './montage.js';
import { normalize } from './field-math.js';
export const WATER_CHANNELS = 32,
  WATER_SAMPLES = 256,
  RIPPLE_EXTENT = 1.05;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function sampleWave(wave, time) {
  if (time < 0 || time > wave.duration) return 0;
  const xs = wave.samples;
  let i;
  if (wave.times) {
    let lo = 0,
      hi = xs.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (wave.times[m] > time) hi = m;
      else lo = m;
    }
    i = lo;
  } else i = Math.min(xs.length - 2, Math.floor(time * wave.rate));
  const t = wave.times?.[i] ?? i / wave.rate,
    dt = wave.times ? wave.times[i + 1] - t : 1 / wave.rate;
  return xs[i] + (xs[i + 1] - xs[i]) * clamp((time - t) / dt, 0, 1);
}
export function waterChannels(frame, selected = '') {
  return (frame.waveform?.channels || [])
    .filter((c) => c.valid && (!selected || c.name === selected))
    .sort((a, b) => (a.status === 'derived') - (b.status === 'derived'))
    .slice(0, WATER_CHANNELS)
    .flatMap((c) => {
      const d = parseDerivation(c.name);
      return d
        ? [
            {
              ...c,
              a: normalize(POSITIONS[d.a]),
              b: d.bipolar ? normalize(POSITIONS[d.b]) : null,
              band: c.bands.indexOf(Math.max(...c.bands)),
            },
          ]
        : [];
    });
}
export function waterAt(p, channels, { scale = 80, lag = 0 } = {}) {
  let sum = 0,
    weight = 0,
    coverage = 0,
    dominant = 0,
    power = 0;
  for (const c of channels)
    for (const [center, sign] of [
      [c.a, 1],
      [c.b, -1],
    ]) {
      if (!center) continue;
      const d = Math.acos(
        clamp(
          p.reduce((s, v, i) => s + v * center[i], 0),
          -1,
          1,
        ),
      );
      if (d >= RIPPLE_EXTENT) continue;
      const k = (1 - (d / RIPPLE_EXTENT) ** 2) ** 3 * (c.status === 'derived' ? 0.4 : 1),
        v = sampleWave(
          c.wave,
          c.wave.duration - 1 / c.wave.rate - lag - (d / RIPPLE_EXTENT) * 1.45,
        );
      sum += k * v * sign;
      weight += k;
      coverage = Math.max(coverage, k);
      if (k * c.rms > power) {
        power = k * c.rms;
        dominant = c.band;
      }
    }
  const voltage = sum / Math.max(1, weight);
  return {
    height: clamp((voltage / Math.max(1, scale)) * 0.2, -0.24, 0.24),
    voltage,
    coverage,
    band: dominant,
  };
}
