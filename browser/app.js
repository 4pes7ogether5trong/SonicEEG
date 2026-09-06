import { mountPatient } from './patient-panel.js';
import { PatientMixer } from './audio.js';
import { PATIENTS, VOICE_PROFILES, audioLevels } from './audio-mapping.js';
import { BANDS } from './signal.js';
import {
  TRIALS,
  TRIAL_DURATION,
  trialEvents,
  scoreTrial,
  prepareExercise,
  listeningSettings,
  trialAudible,
} from './exercise.js';
import { DEMO_LENGTH, demoPhase } from './demo.js';

const $ = (id) => document.getElementById(id);
const mixer = new PatientMixer({ onState: () => refreshCards() });
const panels = [],
  cards = [],
  states = PATIENTS.map(() => ({
    source: 'none',
    active: false,
    hasCapture: false,
  }));
let selected = 0,
  inExercise = false,
  trial = 0,
  trialRunning = false,
  trialStarted = 0,
  trialTimer = null,
  trialToken = 0,
  demoToken = 0,
  practiceToken = 0,
  practiceRunning = false,
  trialPlaying = false,
  trialSettings = null;
let results = [],
  unscored = [],
  practiceTimers = [];
const message = (value) => {
  $('monitor-message').textContent = value;
};
const colors = ['#77d9c7', '#8bbafa', '#dbacf7', '#edca83'];

for (const [slot, name] of PATIENTS.entries()) {
  const card = document.createElement('section');
  card.className = 'patient-card';
  card.style.setProperty('--patient-color', colors[slot]);
  card.innerHTML =
    '<button data-action="view" aria-pressed="false"><b>Patient ' +
    name +
    '</b><span>Octave ' +
    (slot + 3) +
    ' · ' +
    VOICE_PROFILES[slot].name +
    '</span></button><div class="patient-source">No source</div><div class="patient-state">Not started</div><div class="patient-levels" aria-hidden="true"></div><div class="pattern-state"></div><div class="script-state"></div><div class="actions"><button data-action="mute" aria-pressed="false">Mute</button><button data-action="focus" aria-pressed="false">Focus</button><button data-action="identify">Identify</button><button data-action="baseline">Pin baseline</button></div><label>Gain <input type="range" min="0" max="150" value="100" aria-label="Patient ' +
    name +
    ' gain"><output>1.0×</output></label>';
  for (const band of BANDS) {
    const bar = document.createElement('i');
    bar.style.background = band.color;
    card.querySelector('.patient-levels').append(bar);
  }
  $('patients').append(card);
  cards.push(card);
  const root = document.createElement('div');
  root.className = 'patient-panel';
  root.id = 'patient-' + name;
  root.hidden = true;
  root.append($('patient-template').content.cloneNode(true));
  for (const el of root.querySelectorAll('[data-id]'))
    el.id = 'patient-' + name + '-' + el.dataset.id;
  for (const label of root.querySelectorAll('label[for]'))
    label.htmlFor = 'patient-' + name + '-' + label.htmlFor;
  root.querySelector('[data-patient-heading]').textContent =
    'Patient ' + name + ' · visual review';
  root.querySelector('[data-id="setup"] h2').textContent =
    'Patient ' + name + ' · confirm capture setup';
  card
    .querySelector('[data-action="view"]')
    .setAttribute('aria-controls', root.id);
  $('panels').append(root);
  panels.push(
    mountPatient(root, mixer, slot, (state) => {
      states[slot] = state;
      refreshCards();
    }),
  );
  card.querySelector('[data-action="view"]').onclick = () => {
    selected = slot;
    panels.forEach((p, i) => p.setVisible(i === slot && !inExercise));
    refreshCards();
  };
  card.querySelector('[data-action="mute"]').onclick = () => {
    mixer.patient(slot, { muted: !mixer.live.slot(slot).muted });
    refreshCards();
  };
  card.querySelector('[data-action="focus"]').onclick = () => {
    mixer.configure({ focus: mixer.focus === slot ? -1 : slot });
    refreshCards();
  };
  card.querySelector('[data-action="identify"]').onclick = async () => {
    try {
      await mixer.enable();
      mixer.identify(slot);
      message(
        'Reference voice: patient ' +
          name +
          ' · ' +
          VOICE_PROFILES[slot].name +
          '. This cue is not EEG data.',
      );
      refreshCards();
    } catch {
      message('Sound could not start. Select Enable sound again.');
    }
  };
  card.querySelector('[data-action="baseline"]').onclick = () => {
    message(
      mixer.pinBaseline(slot)
        ? 'Patient ' +
            name +
            ': current two-second measurements pinned. Confirm this is an appropriate clean reference in the source EEG. The reference will not drift.'
        : 'A baseline requires fresh, valid observed measurements.',
    );
    refreshCards();
  };
  card.querySelector('input').oninput = (event) => {
    mixer.patient(slot, { gain: Number(event.target.value) / 100 });
    refreshCards();
  };
}
panels[0].setVisible(true);

function refreshCards() {
  mixer.poll();
  if (trialPlaying && !trialAudible(mixer, trial))
    retryTrial('Sound was muted, interrupted or reduced to zero.');
  if (
    trialPlaying &&
    performance.now() - trialStarted > 3500 &&
    TRIALS[trial].active.some((slot) => mixer.live.status(slot) !== 'live')
  )
    retryTrial(
      'An active synthetic source stopped supplying fresh measurements.',
    );
  if (
    practiceRunning &&
    (!mixer.enabled || mixer.context?.state !== 'running' || !mixer.volume)
  ) {
    cancelPractice();
    $('sound-check-state').textContent =
      'Sound check interrupted. Try again before confirming.';
  }
  cards.forEach((card, slot) => {
    const s = mixer.live.slot(slot),
      state = mixer.live.status(slot),
      metadata = states[slot];
    card.classList.toggle('selected', slot === selected);
    card.dataset.state = state;
    card
      .querySelector('[data-action="view"]')
      .setAttribute('aria-pressed', String(slot === selected));
    card.querySelector('.patient-source').textContent = metadata.hasCapture
      ? 'Local EEG window'
      : metadata.source === 'demo'
        ? 'SYNTHETIC'
        : metadata.source === 'none'
          ? 'No source'
          : 'Saved history';
    const labels = {
      idle: 'Not started',
      waiting: 'Waiting for measurements',
      live: 'Live measurements',
      gap: 'No valid signal',
      stale: 'No fresh data · sound faded',
      stopped: 'Stopped · sound off',
      review: 'Capture needs review',
    };
    card.querySelector('.patient-state').textContent =
      (labels[state] || state) +
      (s.muted
        ? ' · MUTED'
        : mixer.focus >= 0 && mixer.focus !== slot
          ? ' · reduced by focus'
          : '');
    card
      .querySelector('[data-action="mute"]')
      .setAttribute('aria-pressed', String(s.muted));
    card.querySelector('[data-action="mute"]').textContent = s.muted
      ? 'Unmute'
      : 'Mute';
    card
      .querySelector('[data-action="focus"]')
      .setAttribute('aria-pressed', String(mixer.focus === slot));
    card.querySelector('[data-action="identify"]').disabled = inExercise;
    card.querySelector('[data-action="baseline"]').disabled =
      inExercise || state !== 'live';
    card.querySelector('output').textContent = s.gain.toFixed(1) + '×';
    const pattern = mixer.trackers[slot].value;
    card.querySelector('.pattern-state').textContent =
      state !== 'live'
        ? ''
        : (pattern.repetitionHz
            ? pattern.distribution +
              ' sharp candidates · ' +
              pattern.repetitionHz.toFixed(1) +
              '/s · '
            : '') +
          (pattern.available
            ? 'Emphasis ' +
              Math.round(pattern.emphasis * 100) +
              '% · persistence ' +
              Math.round(pattern.persistence) +
              's' +
              (pattern.sustained ? ' · sustained attention (10s+)' : '')
            : 'Sharp-shape detail unavailable') +
          (pattern.baseline ? ' · baseline pinned' : ' · no baseline');
    card.querySelector('.script-state').textContent =
      metadata.source === 'demo' && !inExercise
        ? 'PROGRAMMED · ' + demoPhase(slot, panels[slot]?.time() || 0)
        : '';
    const levels = state === 'live' ? audioLevels(s.frame).levels : [];
    card.querySelectorAll('.patient-levels i').forEach((bar, band) => {
      const rms = Math.max(
        0,
        ...levels.filter((l) => l.band === band).map((l) => l.rms),
      );
      bar.style.height = Math.min(100, (100 * rms) / 80) + '%';
    });
  });
  $('audio').textContent =
    mixer.enabled && mixer.context?.state === 'running'
      ? 'Mute all sound'
      : 'Enable sound';
  $('audio').setAttribute(
    'aria-pressed',
    String(mixer.enabled && mixer.context?.state === 'running'),
  );
  $('audio-status').textContent = !mixer.enabled
    ? 'Sound off · capture runs independently'
    : mixer.context?.state !== 'running'
      ? 'Audio interrupted · select Enable sound'
      : (mixer.ambient ? 'Ambient + persistence' : 'Band sound only') +
        ' · live audio is independent of visual review';
  const capturing = panels.some((p) => p.hasCapture());
  $('demo-all').disabled = capturing || inExercise;
  $('exercise-open').disabled = capturing || inExercise;
}

$('audio').onclick = async () => {
  if (mixer.enabled && mixer.context?.state === 'running') mixer.disable();
  else {
    try {
      await mixer.enable();
    } catch {
      message(
        'Audio is unavailable. Check browser sound permissions and try again.',
      );
    }
  }
  refreshCards();
};
$('master-volume').oninput = () => {
  mixer.configure({ volume: Number($('master-volume').value) / 125 });
  $('master-value').textContent = $('master-volume').value + '%';
  if (trialPlaying)
    retryTrial(
      'Output level changed during the clip; your new level is preserved.',
    );
};
$('audio-spatial').onchange = () =>
  mixer.configure({ spatial: $('audio-spatial').value });
$('audio-band').onchange = () =>
  mixer.configure({ band: Number($('audio-band').value) });
$('ambient').onchange = () =>
  mixer.configure({ ambient: $('ambient').checked });
$('visuals').onchange = () =>
  panels.forEach((p) => p.setVisuals($('visuals').checked));
$('demo-all').onclick = async () => {
  if (panels.some((p) => p.hasCapture()) || inExercise) return;
  const token = ++demoToken;
  message(
    'Starting an 84-second guided example. Keep device volume comfortable: quiet background first, then isolated, recurring and sustained changes. Labels show the script, not diagnoses.',
  );
  try {
    await mixer.enable();
    if (token !== demoToken) return;
    mixer.configure({ ambient: true });
    $('ambient').checked = true;
    await Promise.all(
      panels.map((p, slot) =>
        p.demo({ seed: slot + 1, preload: 0, duration: DEMO_LENGTH }),
      ),
    );
    if (token !== demoToken) return;
    refreshCards();
  } catch {
    if (token === demoToken)
      message('The synthetic example could not start. Stop all and try again.');
  }
};

function stopSources() {
  demoToken++;
  panels.forEach((p) => p.stop());
}
$('stop-all').onclick = () => {
  cancelPractice();
  if (trialRunning) retryTrial('Trial stopped.');
  else stopSources();
  message(
    'All four sources stopped. Their captured histories remain available.',
  );
};
function exerciseControls() {
  for (const id of ['audio-spatial', 'audio-band', 'ambient'])
    $(id).disabled = inExercise;
  cards.forEach((card) => {
    for (const selector of [
      '[data-action="mute"]',
      '[data-action="focus"]',
      'input',
    ])
      card.querySelector(selector).disabled =
        inExercise && (trialRunning || selector !== 'input');
  });
  panels.forEach((p) => p.lock(inExercise));
  $('sound-check').disabled = trialRunning || practiceRunning;
  $('trial-unheard').disabled = !trialRunning;
}
$('exercise-open').onclick = () => {
  if (panels.some((p) => p.hasCapture())) return;
  cancelPractice();
  stopSources();
  inExercise = true;
  trial = 0;
  results = [];
  unscored = [];
  trialRunning = trialPlaying = false;
  $('trial-results').replaceChildren();
  $('trial-result').textContent = '';
  $('trial-export').disabled = true;
  $('trial-start').textContent = 'Start trial 1';
  $('trial-start').disabled = true;
  $('sound-confirmed').checked = false;
  $('sound-confirmed').disabled = true;
  $('sound-check-state').textContent =
    'Hear and learn each reference voice first. Start with low device volume.';
  $('trial-state').textContent =
    'Complete the sound check, then confirm a comfortable listening level.';
  $('exercise').hidden = false;
  document.body.classList.add('exercise-active');
  panels.forEach((p) => p.setVisible(false));
  prepareExercise(mixer);
  $('audio-spatial').value = 'maximum';
  $('audio-band').value = '-1';
  $('ambient').checked = true;
  exerciseControls();
  refreshCards();
};
$('exercise-close').onclick = () => {
  cancelPractice();
  clearTimeout(trialTimer);
  trialToken++;
  trialRunning = trialPlaying = false;
  stopSources();
  inExercise = false;
  $('trial-answers').disabled = true;
  $('exercise').hidden = true;
  document.body.classList.remove('exercise-active');
  exerciseControls();
  panels[selected].setVisible(true);
  refreshCards();
};

function cancelPractice() {
  practiceToken++;
  practiceRunning = false;
  practiceTimers.forEach(clearTimeout);
  practiceTimers = [];
  for (let slot = 0; slot < 4; slot++) mixer.cancelNotes(slot, ['reference']);
  $('sound-check').disabled = trialRunning;
}
$('sound-check').onclick = async () => {
  if (!inExercise || trialRunning) return;
  cancelPractice();
  stopSources();
  const token = practiceToken;
  $('sound-confirmed').checked = false;
  $('sound-confirmed').disabled = true;
  $('trial-start').disabled = true;
  $('sound-check').disabled = true;
  try {
    await mixer.enable();
    if (!inExercise || token !== practiceToken) return;
    if (!mixer.volume) throw new Error('Master volume is zero.');
    practiceRunning = true;
    PATIENTS.forEach((name, slot) => {
      practiceTimers.push(
        setTimeout(() => {
          if (token !== practiceToken) return;
          mixer.identify(slot);
          $('sound-check-state').textContent =
            'Patient ' +
            name +
            ' · ' +
            VOICE_PROFILES[slot].name +
            ' · octave ' +
            (slot + 3) +
            ' (reference voice)';
        }, slot * 1800),
      );
    });
    practiceTimers.push(
      setTimeout(() => {
        if (token !== practiceToken) return;
        practiceRunning = false;
        $('sound-check').disabled = false;
        $('sound-confirmed').disabled = false;
        $('sound-check-state').textContent =
          'Check complete. Confirm only if you heard all four voices comfortably; replay or adjust your device if needed.';
      }, 7200),
    );
  } catch {
    if (token !== practiceToken) return;
    cancelPractice();
    $('sound-check-state').textContent =
      'Sound could not start. Check master/device volume and browser sound permission, then retry.';
  }
};
$('sound-confirmed').onchange = () => {
  $('trial-start').disabled =
    !$('sound-confirmed').checked || trialRunning || trial >= TRIALS.length;
};

function retryTrial(reason, unheard = false) {
  if (trialRunning)
    unscored.push({
      trial: trial + 1,
      reason,
      settings: trialSettings,
      elapsedSeconds: Math.round((performance.now() - trialStarted) / 10) / 100,
    });
  trialRunning = trialPlaying = false;
  trialToken++;
  clearTimeout(trialTimer);
  stopSources();
  if (unheard) {
    $('sound-confirmed').checked = false;
    $('sound-confirmed').disabled = true;
  }
  $('trial-answers').disabled = true;
  $('trial-start').disabled =
    !$('sound-confirmed').checked || trial >= TRIALS.length;
  $('trial-state').textContent =
    reason +
    ' Not scored. ' +
    (unheard
      ? 'Repeat the sound check, then retry this clip.'
      : 'Retry this clip when ready.');
  $('trial-export').disabled = !results.length && !unscored.length;
  exerciseControls();
}
$('trial-unheard').onclick = () => {
  if (trialRunning) retryTrial('Clip was not comfortably audible.', true);
};

$('trial-start').onclick = async () => {
  if (
    !inExercise ||
    trialRunning ||
    trial >= TRIALS.length ||
    !$('sound-confirmed').checked
  )
    return;
  cancelPractice();
  const token = ++trialToken;
  $('trial-start').disabled = true;
  try {
    await mixer.enable();
    if (!inExercise || token !== trialToken) return;
    if (!trialAudible(mixer, trial)) {
      $('trial-start').disabled = false;
      $('trial-state').textContent =
        'Master volume and each active patient gain must be above zero. Set a comfortable level first.';
      return;
    }
    stopSources();
    const spec = TRIALS[trial];
    $('trial-result').textContent = '';
    $('trial-answers')
      .querySelectorAll('input')
      .forEach((input) => {
        input.checked = false;
        input.disabled = !spec.active.includes(Number(input.value));
      });
    trialRunning = true;
    trialSettings = listeningSettings(mixer);
    trialStarted = performance.now();
    exerciseControls();
    await Promise.all(
      spec.active.map((slot) =>
        panels[slot].demo({
          preload: 0,
          seed: trial + 101,
          changes: trialEvents(trial),
          duration: TRIAL_DURATION,
        }),
      ),
    );
    if (token !== trialToken || !inExercise) return;
    trialPlaying = true;
    trialStarted = performance.now();
    $('trial-answers').disabled = false;
    $('trial-state').textContent =
      'Trial ' +
      (trial + 1) +
      ' of 8 · listening to ' +
      spec.active.map((i) => PATIENTS[i]).join(', ') +
      '.';
    trialTimer = setTimeout(() => {
      if (token !== trialToken) return;
      trialPlaying = false;
      stopSources();
      $('trial-state').textContent =
        'Clip complete. Submit the patients you heard change.';
    }, TRIAL_DURATION * 1000);
    refreshCards();
  } catch {
    if (token !== trialToken) return;
    retryTrial('The clip could not start. Check browser sound permissions.');
  }
};
$('trial-answer').onclick = () => {
  if (!trialRunning) return;
  const answer = [...$('trial-answers').querySelectorAll('input:checked')].map(
    (i) => Number(i.value),
  );
  const result = scoreTrial(
    trial,
    answer,
    (performance.now() - trialStarted) / 1000,
  );
  result.settings = trialSettings;
  result.soundCheckConfirmed = true;
  results.push(result);
  trialRunning = trialPlaying = false;
  clearTimeout(trialTimer);
  stopSources();
  $('trial-answers').disabled = true;
  const description =
    'Trial ' +
    result.trial +
    ': ' +
    (result.correct ? 'Correct' : 'Missed') +
    ' · ' +
    result.targets.map((i) => PATIENTS[i]).join(' + ') +
    ' · ' +
    result.pattern +
    ' (programmed)';
  $('trial-result').textContent = description;
  const li = document.createElement('li');
  li.textContent = description;
  $('trial-results').append(li);
  $('trial-export').disabled = false;
  trial++;
  if (trial === TRIALS.length) {
    $('trial-state').textContent =
      results.filter((r) => r.correct).length +
      '/8 exact patient selections. These synthetic results do not establish clinical performance.';
    $('trial-start').disabled = true;
  } else {
    $('trial-start').textContent = 'Start trial ' + (trial + 1);
    $('trial-start').disabled = false;
  }
  exerciseControls();
};
$('trial-export').onclick = () => {
  const url = URL.createObjectURL(
    new Blob(
      [
        JSON.stringify(
          {
            protocol: 'soniceeg-ambient-v2',
            synthetic: true,
            clipSeconds: TRIAL_DURATION,
            results,
            unscored,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    ),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = 'soniceeg-listening-results.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
setInterval(refreshCards, 500);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (trialPlaying)
      retryTrial(
        'The tab left the foreground; uninterrupted listening cannot be assumed.',
      );
    if (practiceRunning) {
      cancelPractice();
      $('sound-check-state').textContent =
        'Sound check interrupted when the tab left the foreground. Please repeat.';
    }
    message(
      'This tab is in the background. Capture may pause; stale measurements will fade from sound.',
    );
  } else
    message(
      'Tab active. Check each patient for fresh measurements before continuing.',
    );
});
window.addEventListener('beforeunload', () => mixer.disable());
refreshCards();
