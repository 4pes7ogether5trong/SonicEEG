// Fully synthetic examples: scripted EEG appearances, not patient recordings.
import { POSITIONS } from './montage.js';
export const SHOWCASE_LENGTH = 720;
export const SHOWCASE_SENSORS = [
  'FP1',
  'FP2',
  'F7',
  'F3',
  'FZ',
  'F4',
  'F8',
  'T7',
  'C3',
  'CZ',
  'C4',
  'T8',
  'P7',
  'P3',
  'PZ',
  'P4',
  'P8',
  'O1',
  'O2',
];
export const SAMPLER_LABELS = [
  '3/s generalized spike-wave · absence-like',
  'Sustained evolving seizure · NCSE scenario',
  'N3-like slow-wave sleep',
  'Awake, eyes open · intermittent blinks',
];
export const SEIZURE_INTERVALS = [
  Array.from({ length: 6 }, (_, i) => [12 + i * 120, 24 + i * 120]),
  [[10, SHOWCASE_LENGTH]],
  [],
  [],
];
export function showcasePhase(time, slot = 0) {
  const active = SEIZURE_INTERVALS[slot].some(([a, b]) => time >= a && time < b);
  if (slot === 0)
    return active ? '3/s generalized spike-wave' : 'Awake background · between GSW episodes';
  if (slot === 1)
    return time < 10
      ? 'Reference background'
      : time < 610
        ? 'Continuous evolving seizure pattern'
        : 'Electrographic status scenario · >10 min';
  return SAMPLER_LABELS[slot];
}
const TAU = 2 * Math.PI;
const gauss = (x, w) => Math.exp(-0.5 * (x / w) ** 2);
const smooth = (x) => {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
};
const spot = ([x, y, z], [a, b, c], w) =>
  Math.exp(-((x - a) ** 2 + (y - b) ** 2 + (z - c) ** 2) / (2 * w * w));
function potential(pos, t, slot, seed) {
  const [x, y, z] = pos,
    phase = seed * 0.31;
  const front = spot(pos, [0, 0.6, -0.7], 0.65),
    back = spot(pos, [0, 0.4, 0.85], 0.5);
  let value =
    1.5 * Math.sin(TAU * 6.37 * t + x + phase) +
    8 * Math.sin(TAU * 18.73 * t + y * 2 + phase) +
    5 * Math.sin(TAU * 25.91 * t - z + phase) +
    4 * back * Math.sin(TAU * 10.21 * t + x * 0.7 + phase);
  if (slot === 0) {
    const event = SEIZURE_INTERVALS[0].find(([a, b]) => t >= a && t < b);
    if (event) {
      const u = t - event[0],
        pulse = u - Math.floor(u * 3) / 3 - 0.04;
      const envelope = smooth(u / 0.04) * smooth((event[1] - t) / 0.04);
      // Same 3/s complexes throughout the cap, with a symmetric frontal maximum.
      value +=
        envelope * (0.35 + front) * 160 * (gauss(pulse, 0.014) - 0.65 * gauss(pulse - 0.12, 0.055));
    }
  } else if (slot === 1 && t >= 10) {
    const u = t - 10,
      hz = 3.2 + 0.7 * Math.sin((TAU * u) / 70);
    const cycles = 3.2 * u + ((0.7 * 70) / TAU) * (1 - Math.cos((TAU * u) / 70));
    const pulse = (cycles - Math.round(cycles)) / hz;
    const spread = smooth(u / 80);
    const location =
      spot(pos, [0.8, 0.35, -0.05], 0.38 + 0.25 * spread) +
      0.45 * spread * spot(pos, [-0.6, 0.6, -0.3], 0.6);
    const envelope = smooth(u / 0.3);
    value +=
      envelope *
      location *
      (150 + 35 * Math.sin((TAU * u) / 29)) *
      (gauss(pulse, 0.017) - 0.5 * gauss(pulse - 0.105, 0.048));
    value +=
      envelope *
      location *
      32 *
      Math.sin(TAU * (5 * u + ((0.15 * 50) / TAU) * (1 - Math.cos((TAU * u) / 50))) + x);
  } else if (slot === 2) {
    const waxing = 0.8 + 0.2 * Math.sin((TAU * t) / 18);
    value =
      0.3 * value +
      waxing *
        (0.35 + front) *
        (100 * Math.sin(TAU * 0.87 * t + 0.25 * x) +
          55 * Math.sin(TAU * 1.43 * t + 0.6 * z + phase));
    const spindle = gauss((t % 23) - 15, 0.65);
    value += 9 * spindle * spot(pos, [0, 0.95, 0], 0.55) * Math.sin(TAU * 13.1 * t);
  } else if (slot === 3) {
    // Unevenly spaced, broad frontal deflections: not sharp-discharge templates.
    for (const at of [9, 23.5, 24.4, 51, 79, 104]) {
      const u = (t % 120) - at;
      value +=
        105 * spot(pos, [0, 0.3, -0.95], 0.38) * (gauss(u, 0.11) - 0.22 * gauss(u - 0.22, 0.18));
    }
  }
  return value;
}
export function showcaseBlock(start, duration = 0.5, rate = 128, { slot = 0, seed = 1 } = {}) {
  const count = Math.round(duration * rate);
  const channels = SHOWCASE_SENSORS.map((name) => ({
    name: name + '-AVG',
    samples: new Float64Array(count),
  }));
  for (let i = 0; i < count; i++) {
    const t = start + i / rate,
      values = SHOWCASE_SENSORS.map((name) => potential(POSITIONS[name], t, slot, seed));
    const average = values.reduce((sum, v) => sum + v, 0) / values.length;
    channels.forEach((c, j) => {
      c.samples[i] = values[j] - average;
    });
  }
  return channels;
}
