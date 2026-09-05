export const TRIALS = Object.freeze([
  { active: [0], targets: [0], band: 1 },
  { active: [1, 3], targets: [3], band: 3 },
  { active: [0, 1, 2, 3], targets: [1], band: 1 },
  { active: [0, 2], targets: [0], band: 3 },
  { active: [0, 1, 2, 3], targets: [2], band: 3 },
  { active: [0, 1, 2, 3], targets: [0, 3], band: 1 },
  { active: [2], targets: [2], band: 3 },
  { active: [0, 1, 2, 3], targets: [1, 2], band: 3 },
]);
export function scoreTrial(index, selected, elapsed) {
  const trial = TRIALS[index];
  const answer = [...new Set(selected)].sort();
  const targets = [...trial.targets].sort();
  return {
    trial: index + 1,
    active: trial.active,
    targets,
    answer,
    correct: JSON.stringify(answer) === JSON.stringify(targets) && elapsed >= 8,
    elapsedSeconds: Math.round(elapsed * 100) / 100,
    nominalChangeSeconds: 8,
    responseAfterChangeSeconds: Math.round((elapsed - 8) * 100) / 100,
    band: trial.band,
    seed: index + 101,
  };
}
