// Entirely synthetic, calibrated signals. No fallback to these signals after
// capture failure. Exercise changes are fixed before the trial starts.
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
        const events = changes || [
          {
            start: 12 + slot * 8,
            end: 22 + slot * 8,
            slots: [slot],
            band: 1,
            repeat: 56,
          },
        ];
        for (const e of events) {
          const u = e.repeat ? t % e.repeat : t;
          if (
            !e.slots.includes(slot) ||
            u < e.start ||
            u >= e.end ||
            ![1, 2].includes(channel)
          )
            continue;
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
