// Entirely synthetic, calibrated signals. No fallback to these signals after
// capture failure. Exercise changes are fixed before the trial starts.
import { POSITIONS, parseDerivation } from './montage.js';
export const DEMO_LENGTH = 84;
export const DEMO_EVENTS = [
  {
    start: 8,
    end: 8.8,
    slots: [0],
    type: 'single',
    location: 'left',
    label: 'isolated left sharp transient',
  },
  {
    start: 16,
    end: 36,
    slots: [0],
    type: 'periodic',
    hz: 1.25,
    location: 'left',
    label: 'persistent left periodic-like activity',
  },
  {
    start: 27,
    end: 51,
    slots: [1],
    type: 'periodic',
    hz: 1,
    location: 'bilateral',
    label: 'bilateral periodic-like activity',
  },
  {
    start: 43,
    end: 63,
    slots: [2],
    type: 'spike-wave',
    hz: 3,
    location: 'bilateral',
    label: 'bilateral spike-and-slow-wave-like activity',
  },
  ...[13, 24, 35, 59].map((start) => ({
    start,
    end: start + 1.5,
    slots: [3],
    type: 'periodic',
    hz: 2,
    location: 'right',
    label: 'brief recurring right sharp complexes',
  })),
  {
    start: 66,
    end: 76,
    slots: [3],
    type: 'periodic',
    hz: 1.5,
    location: 'right',
    label: 'persistent right sharp complexes',
  },
];
export function demoPhase(slot, time) {
  return (
    DEMO_EVENTS.filter(
      (e) => e.slots.includes(slot) && time >= e.start && time < e.end,
    )
      .map((e) => e.label)
      .join(' · ') ||
    (time >= 76 ? 'return to quiet background' : 'quiet background')
  );
}
const gaussian = (t, width) => Math.exp(-0.5 * (t / width) ** 2);
function spatialWeight(electrode, location) {
  const [x, y, z] = POSITIONS[electrode];
  if (location === 'bilateral') return -0.9 * z + 0.2 * y;
  return Math.exp(-((x - (location === 'right' ? 1 : -1)) ** 2 + z ** 2) / 0.5);
}
function complex(t, event) {
  const hz = event.type === 'single' ? 0 : event.hz || 1;
  const elapsed = t - event.start - 0.25;
  if (elapsed < -0.1) return 0;
  const pulse = hz ? elapsed - Math.round(elapsed * hz) / hz : elapsed;
  const spike = gaussian(pulse, 0.015);
  // A broader, opposite-polarity component follows the sharp component.
  const slow = gaussian(
    pulse - 0.115,
    event.type === 'spike-wave' ? 0.065 : 0.055,
  );
  return (event.amplitude || 170) * (spike - 0.4 * slow);
}
const NAMES = [
  'FP1-F7',
  'F7-T7',
  'T7-P7',
  'P7-O1',
  'FP1-F3',
  'F3-C3',
  'C3-P3',
  'P3-O1',
  'FP2-F8',
  'F8-T8',
  'T8-P8',
  'P8-O2',
  'FP2-F4',
  'F4-C4',
  'C4-P4',
  'P4-O2',
  'FZ-CZ',
  'CZ-PZ',
];
export function patientDemoBlock(
  start,
  duration = 0.5,
  rate = 128,
  { slot = 0, seed = 1, changes = null } = {},
) {
  return NAMES.map((name, channel) => ({
    name,
    samples: Float64Array.from(
      { length: Math.round(duration * rate) },
      (_, i) => {
        const t = start + i / rate,
          phase = channel * 0.43 + seed * 0.27 + slot * 0.8;
        let x =
          (name.includes('O') ? 17 : 7) *
            Math.sin(2 * Math.PI * (9.6 + slot * 0.2) * t + phase) +
          5 * Math.sin(2 * Math.PI * 2 * t + phase * 2) +
          2 * Math.sin(2 * Math.PI * 19 * t + phase * 0.7);
        const events = changes || DEMO_EVENTS;
        for (const e of events) {
          const u = e.repeat ? t % e.repeat : t;
          if (!e.slots.includes(slot) || u < e.start || u >= e.end) continue;
          if (e.type) {
            const d = parseDerivation(name);
            x +=
              complex(u, e) *
              (spatialWeight(d.a, e.location) - spatialWeight(d.b, e.location));
            continue;
          }
          if (![1, 2].includes(channel)) continue;
          const envelope = Math.min(1, (u - e.start) / 0.6, (e.end - u) / 0.6);
          x +=
            46 *
            envelope *
            Math.sin(2 * Math.PI * [2, 6, 11, 20, 35][e.band] * t + phase);
        }
        return x;
      },
    ),
  }));
}
