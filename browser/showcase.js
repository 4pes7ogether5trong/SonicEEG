// Scripted sensor potentials for exploring the renderer, not patient recordings.
// Signals are continuous in sample time and shared by sound and the 3D field.
import { POSITIONS } from './montage.js';

export const SHOWCASE_LENGTH = 144;
export const SHOWCASE_SCENES = [
  'Posterior alpha · waxing and waning',
  'Traveling focus · theta to beta',
  'Focal sharp trains · growing and spreading',
  'Bilateral rhythm · synchronized packets',
  'Quiet intervals · alternating bursts',
  'Layered recovery · multiple frequencies',
];
export const SHOWCASE_SENSORS = [
  'FP1', 'FP2', 'F7', 'F3', 'FZ', 'F4', 'F8', 'T7', 'C3', 'CZ',
  'C4', 'T8', 'P7', 'P3', 'PZ', 'P4', 'P8', 'O1', 'O2',
];
const TAU = 2 * Math.PI;
const smooth = (x) => {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
};
const envelope = (t, start, end) =>
  smooth((t - start) / 2) * smooth((end - t) / 2);
const gaussian = (x, width) => Math.exp(-0.5 * (x / width) ** 2);
const spot = ([x, y, z], [a, b, c], width) =>
  Math.exp(-((x - a) ** 2 + (y - b) ** 2 + (z - c) ** 2) / (2 * width ** 2));

export function showcasePhase(time) {
  return time >= SHOWCASE_LENGTH
    ? 'Complete · explore the accumulated field'
    : SHOWCASE_SCENES[Math.max(0, Math.min(5, Math.floor(time / 24)))];
}

function potential(position, t, slot, seed) {
  const [x, y, z] = position;
  const phase = seed * .31 + slot * .83;
  const direction = slot % 2 ? -1 : 1;
  const posterior = spot(position, [0, .35, .9], .55);
  const anterior = spot(position, [0, .4, -.9], .45);
  const quiet = 1 - .9 * envelope(t, 96, 120);
  // Low amplitude, deterministic multitone background. No independent row noise.
  let value = quiet * (
    4 * Math.sin(TAU * (2.13 + slot * .07) * t + x * 1.1 + z * .7 + phase) +
    2 * Math.sin(TAU * 19.37 * t + y * 2 + phase) +
    1.4 * Math.sin(TAU * 7.19 * t + z * 2 - x + phase)
  );
  const alpha = envelope(t, 0, 26) + envelope(t, 120, 144);
  value += alpha * posterior * (24 + 18 * Math.sin(TAU * .17 * t + phase)) *
    Math.sin(TAU * (9.3 + slot * .43) * t + x * .4 + phase);
  // Two smooth frontal blink-like deflections in the opening scene.
  value += anterior * 55 * (gaussian(t - 8, .18) + gaussian(t - 16, .22));

  const u = t - 24, p = Math.max(0, Math.min(1, u / 24));
  const center = [direction * (-.95 + 1.9 * p), .42 + .3 * Math.sin(Math.PI * p),
    .5 * Math.sin(TAU * p + slot * .4)];
  const moving = spot(position, center, .38);
  // Integral of f(u)=4+18u/24: frequency changes without phase discontinuities.
  value += envelope(t, 24, 48) * moving * (50 + 45 * p) *
    Math.sin(TAU * (4 * u + .375 * u * u) + phase - x * .6);

  const v = t - 48, q = Math.max(0, Math.min(1, v / 24));
  const cycles = 1.2 * v + .035 * v * v;
  const hz = 1.2 + .07 * v;
  const pulse = (cycles - Math.round(cycles)) / Math.max(.5, hz);
  value += envelope(t, 48, 72) * spot(position, [-direction * .95, .2, .05], .25 + .3 * q) *
    (100 + 70 * q) * (gaussian(pulse, .017) - .4 * gaussian(pulse - .12, .06));

  const bilateral = spot(position, [-.7, .65, -.35], .5) +
    spot(position, [.7, .65, -.35], .5);
  const packet = .3 + .7 * Math.sin(Math.PI * (t - 72) / 4) ** 2;
  value += envelope(t, 72, 96) * bilateral * packet *
    (65 * Math.sin(TAU * (3.1 + slot * .13) * t + phase) +
      18 * Math.sin(TAU * 15.7 * t + phase));

  const burstTime = t - 96, burstIndex = Math.floor(burstTime / 4);
  const burst = gaussian((burstTime % 4) - 2, .38);
  const side = burstIndex % 2 ? direction : -direction;
  value += envelope(t, 96, 120) * burst * spot(position, [side * .6, .6, .25], .6) *
    (110 * Math.sin(TAU * 5.4 * t + phase) + 32 * Math.sin(TAU * 21.3 * t));

  const recovery = envelope(t, 120, 144) * (1 - smooth((t - 136) / 8));
  value += recovery * (
    32 * anterior * Math.sin(TAU * 6.2 * t + phase) +
    22 * spot(position, [direction * .85, .3, 0], .4) * Math.sin(TAU * 34.7 * t + phase)
  );
  return value;
}

export function showcaseBlock(start, duration = .5, rate = 128, { slot = 0, seed = 1 } = {}) {
  const count = Math.round(duration * rate);
  const channels = SHOWCASE_SENSORS.map((name) => ({
    name: name + '-AVG', samples: new Float64Array(count),
  }));
  for (let i = 0; i < count; i++) {
    const t = start + i / rate;
    const values = SHOWCASE_SENSORS.map((name) => potential(POSITIONS[name], t, slot, seed));
    const average = values.reduce((sum, v) => sum + v, 0) / values.length;
    for (let c = 0; c < channels.length; c++) channels[c].samples[i] = values[c] - average;
  }
  return channels;
}
