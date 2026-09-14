import { randomGenerator } from './recordings.js';
export const CONDITIONS = [
  { id: 'raw', label: 'Raw traces', visual: false, audio: false },
  { id: 'visual', label: 'Raw + 3D', visual: true, audio: false },
  { id: 'audio', label: 'Raw + sound', visual: false, audio: true },
  { id: 'combined', label: 'Raw + 3D + sound', visual: true, audio: true },
];
// Williams order balances first-order carryover across four participant groups.
const ORDERS = [
  [0, 1, 3, 2],
  [1, 2, 0, 3],
  [2, 3, 1, 0],
  [3, 0, 2, 1],
];
export function makeTrials(group = 1, seed = 2026) {
  const rng = randomGenerator(seed),
    order = ORDERS[(((Math.floor(group) - 1) % 4) + 4) % 4],
    trials = [];
  for (const condition of order) {
    // Match target morphology across conditions; vary noise/phase with held-out
    // seeds. Choosing different target types per condition would confound the UI.
    const clips = [
      { dataset: 'alert', epoch: 2, target: false },
      { dataset: 'drowsy', epoch: 7, target: false },
      { dataset: 'bursts', epoch: [2, 5, 8][seed % 3], target: true },
    ];
    for (let i = clips.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [clips[i], clips[j]] = [clips[j], clips[i]];
    }
    for (const clip of clips)
      trials.push({
        ...clip,
        condition: CONDITIONS[condition],
        seed: seed + condition * 97 + trials.length + 1,
      });
  }
  return trials;
}
export function scoreTrials(results) {
  return CONDITIONS.map((c) => {
    const rows = results.filter((r) => r.condition === c.id),
      counts = { hits: 0, misses: 0, false_positives: 0, correct_rejections: 0 };
    for (const r of rows)
      counts[
        r.target
          ? r.response
            ? 'hits'
            : 'misses'
          : r.response
            ? 'false_positives'
            : 'correct_rejections'
      ]++;
    const times = rows.map((r) => r.response_seconds).sort((a, b) => a - b),
      m = Math.floor(times.length / 2);
    return {
      condition: c.id,
      n: rows.length,
      ...counts,
      median_response_seconds: times.length
        ? times.length % 2
          ? times[m]
          : (times[m - 1] + times[m]) / 2
        : null,
    };
  });
}
