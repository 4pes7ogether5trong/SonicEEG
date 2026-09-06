import { POSITIONS, parseDerivation } from './montage.js';
import { BANDS, clamp, prevalence } from './signal.js';
export const normalize = (p) => {
  const d = Math.hypot(...p) || 1;
  return p.map((v) => v / d);
};
export function scalpGrid(rows = 20, cols = 32) {
  const vertices = [],
    indices = [];
  for (let y = 0; y <= rows; y++)
    for (let x = 0; x <= cols; x++) {
      const phi = 0.08 + (y / rows) * 1.75,
        theta = (x / cols) * Math.PI * 2;
      vertices.push([
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi) * 0.88,
        Math.sin(phi) * Math.sin(theta) * 1.12,
      ]);
    }
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const a = y * (cols + 1) + x,
        b = a + cols + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  return { vertices, indices };
}
export function fieldWeights(vertices, names) {
  const bases = names.map(parseDerivation);
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  return vertices.map((v) => {
    const unit = normalize(v);
    return bases.map((p) => {
      if (!p) return { signed: 0, weight: 0 };
      const a = normalize(POSITIONS[p.a]),
        wa = Math.exp(-(Math.acos(clamp(dot(unit, a), -1, 1)) ** 2) / 0.16);
      const wb = p.bipolar
        ? Math.exp(
            -(
              Math.acos(clamp(dot(unit, normalize(POSITIONS[p.b])), -1, 1)) ** 2
            ) / 0.16,
          )
        : 0;
      return { signed: wa - wb, weight: p.bipolar ? (wa + wb) / 2 : wa };
    });
  });
}
export function sampleField(
  weights,
  channels,
  band,
  scale = 80,
  peaks = false,
  selected = '',
  threshold = -1,
) {
  let sum = 0,
    power = 0,
    signed = 0,
    coverage = 0,
    affected = 0;
  weights.forEach((w, i) => {
    const c = channels[i];
    if (!c?.valid || (selected && c.name !== selected)) return;
    const p =
      threshold >= 0
        ? prevalence(c, band, threshold)
        : ((peaks ? c.peakBands?.[band] : null) ?? c.bands[band] ?? 0);
    if (p == null) return;
    sum += w.weight;
    power += w.weight * p;
    signed +=
      w.signed *
      (peaks
        ? Math.abs(c.min) > Math.abs(c.max)
          ? c.min
          : c.max
        : c.last || 0);
    coverage = Math.max(coverage, w.weight);
    if (c.affected?.[band]) affected += w.weight;
  });
  if (sum < 1e-6) return { amp: 0, magnitude: 0, displacement: 0, coverage: 0, affected: 0 };
  return {
    magnitude: power / sum,
    amp:
      threshold >= 0
        ? clamp(power / sum, 0, 1)
        : clamp(Math.log1p(Math.sqrt(power / sum) / scale) * 2, 0, 1),
    displacement:
      threshold >= 0 ? 0 : clamp(signed / (sum * scale), -1, 1) * 0.16,
    coverage: clamp(coverage * 2, 0, 1),
    affected: affected / sum,
  };
}
export function timePosition(age, total, focusAge = 0, lens = 0.5) {
  const span = Math.max(1, total),
    tau = Math.max(0.5, span / (4 + Math.pow(80, lens)));
  const lo = Math.asinh(-focusAge / tau),
    hi = Math.asinh((span - focusAge) / tau);
  return (Math.asinh((age - focusAge) / tau) - lo) / (hi - lo || 1);
}

// One surface per time slice; choose a band rather than mixing five translucent hues.
export function spectralField(weights, channels, { band = -1, scale = 80, peaks = false, selected = '', threshold = -1 } = {}) {
  const values = BANDS.map((_, b) => sampleField(weights, channels, b, scale, peaks, selected, threshold));
  const dominant = band >= 0 ? band : values.reduce((best, v, b) => v.magnitude > values[best].magnitude ? b : best, 0);
  return { ...values[dominant], band: dominant };
}
export function sidePosition(time, total, focus = total, lens = .5) {
  return 4 - 8 * timePosition(total - time, total, total - focus, lens);
}
export function fieldTime(time) {
  time = Math.max(0, Math.round(time));
  return time >= 3600
    ? `${Math.floor(time / 3600)}:${String(Math.floor(time / 60) % 60).padStart(2, '0')}:${String(time % 60).padStart(2, '0')}`
    : `${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}`;
}
export function sideTicks(total, focus = total, lens = .5) {
  return [0, .25, .5, .75, 1].map(f => ({ time: total * f, x: sidePosition(total * f, total, focus, lens) }));
}
