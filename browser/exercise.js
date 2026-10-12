export const TRIALS = Object.freeze([
  {
    active: [0],
    targets: [0],
    band: 1,
    type: 'single',
    location: 'left',
    label: 'isolated sharp transient',
  },
  {
    active: [1, 3],
    targets: [3],
    band: 3,
    type: 'periodic',
    hz: 1.25,
    location: 'right',
    label: 'persistent right periodic-like activity',
  },
  {
    active: [0, 1, 2, 3],
    targets: [1],
    band: 1,
    type: 'periodic',
    hz: 1,
    location: 'bilateral',
    label: 'bilateral periodic-like activity',
  },
  {
    active: [0, 2],
    targets: [0],
    band: 3,
    type: 'spike-wave',
    hz: 3,
    location: 'left',
    label: 'left spike-and-slow-wave-like activity',
  },
  {
    active: [0, 1, 2, 3],
    targets: [2],
    band: 3,
    type: 'spike-wave',
    hz: 3,
    location: 'bilateral',
    label: 'bilateral spike-and-slow-wave-like activity',
  },
  {
    active: [0, 1, 2, 3],
    targets: [0, 3],
    band: 1,
    type: 'periodic',
    hz: 1.5,
    location: 'left',
    label: 'two patients with repeating sharp complexes',
  },
  {
    active: [2],
    targets: [2],
    band: 3,
    type: 'single',
    location: 'bilateral',
    label: 'isolated bilateral sharp transient',
  },
  {
    active: [0, 1, 2, 3],
    targets: [1, 2],
    band: 3,
    type: 'spike-wave',
    hz: 3,
    location: 'bilateral',
    label: 'two patients with spike-and-slow-wave-like activity',
  },
]);
export const TRIAL_DURATION = 30;
// Preparing the exercise must NEVER undo the listener's level calibration.
export function prepareExercise(mixer) {
  // The fixed listening protocol uses a continuous reference without overwriting
  // the user's patient profiles. Leaving the exercise restores their modes.
  mixer.exerciseMode = true;
  mixer.configure({ focus: -1, spatial: 'maximum', band: -1, ambient: true });
  for (let slot = 0; slot < 4; slot++) mixer.patient(slot, { muted: false });
}
export function listeningSettings(mixer) {
  return {
    master: mixer.volume,
    gains: Array.from({ length: 4 }, (_, slot) => mixer.live.slot(slot).gain),
    patients: Array.from({ length: 4 }, (_, slot) => ({
      octave: mixer.live.slot(slot).octave,
      ...mixer.soundSettings(slot),
    })),
    spatial: mixer.spatial,
    band: mixer.band,
    emphasis: mixer.ambient,
    focus: mixer.focus,
  };
}
export function trialAudible(mixer, index) {
  return Boolean(
    TRIALS[index] &&
      mixer.enabled &&
      mixer.context?.state === 'running' &&
      mixer.volume > 0 &&
      TRIALS[index].active.every(
        (slot) => !mixer.live.slot(slot).muted && mixer.live.slot(slot).gain > 0,
      ),
  );
}
export function trialEvents(index) {
  const t = TRIALS[index];
  return [{ ...t, slots: t.targets, start: 8, end: t.type === 'single' ? 8.8 : 24 }];
}
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
    pattern: trial.label,
    seed: index + 101,
  };
}
