import { mountPatient } from './patient-panel.js';
import { PatientMixer } from './audio.js';
import { PATIENTS, NOTES, audioLevels } from './audio-mapping.js';
import { BANDS } from './signal.js';
import { TRIALS, scoreTrial } from './exercise.js';

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
  demoToken = 0;
let results = [];
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
    ' · C–A</span></button><div class="patient-source">No source</div><div class="patient-state">Not started</div><div class="patient-levels" aria-hidden="true"></div><div class="actions"><button data-action="mute" aria-pressed="false">Mute</button><button data-action="focus" aria-pressed="false">Focus</button><button data-action="identify">Identify</button></div><label>Gain <input type="range" min="0" max="150" value="100" aria-label="Patient ' +
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
        'Reference note: patient ' +
          name +
          ' · C' +
          (slot + 3) +
          '. This cue is not EEG data.',
      );
      refreshCards();
    } catch {
      message('Sound could not start. Select Enable sound again.');
    }
  };
  card.querySelector('input').oninput = (event) => {
    mixer.patient(slot, { gain: Number(event.target.value) / 100 });
    refreshCards();
  };
}
panels[0].setVisible(true);

function refreshCards() {
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
    card.querySelector('output').textContent = s.gain.toFixed(1) + '×';
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
      : 'LIVE audio · visual review does not change sound';
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
  mixer.configure({ volume: Number($('master-volume').value) / 200 });
  $('master-value').textContent = $('master-volume').value + '%';
};
$('audio-spatial').onchange = () =>
  mixer.configure({ spatial: $('audio-spatial').value });
$('audio-band').onchange = () =>
  mixer.configure({ band: Number($('audio-band').value) });
$('visuals').onchange = () =>
  panels.forEach((p) => p.setVisuals($('visuals').checked));
$('demo-all').onclick = async () => {
  if (panels.some((p) => p.hasCapture()) || inExercise) return;
  const token = ++demoToken;
  message(
    'Starting four synthetic sources. Select Enable sound, then use Identify to learn each octave.',
  );
  try {
    await Promise.all(panels.map((p, slot) => p.demo({ seed: slot + 1 })));
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
  stopSources();
  clearTimeout(trialTimer);
  trialToken++;
  trialRunning = false;
  if (inExercise) {
    $('trial-start').disabled = false;
    $('trial-answers').disabled = true;
    $('trial-state').textContent = 'Trial stopped. Start again when ready.';
  }
  message(
    'All four sources stopped. Their captured histories remain available.',
  );
};
function exerciseControls(locked) {
  for (const id of ['audio-spatial', 'audio-band']) $(id).disabled = locked;
  cards.forEach((card) => {
    for (const selector of [
      '[data-action="mute"]',
      '[data-action="focus"]',
      'input',
    ])
      card.querySelector(selector).disabled = locked;
  });
  panels.forEach((p) => p.lock(locked));
}
$('exercise-open').onclick = () => {
  if (panels.some((p) => p.hasCapture())) return;
  stopSources();
  inExercise = true;
  trial = 0;
  results = [];
  $('trial-results').replaceChildren();
  $('trial-result').textContent = '';
  $('trial-export').disabled = true;
  $('trial-start').textContent = 'Start trial 1';
  $('trial-start').disabled = false;
  $('exercise').hidden = false;
  document.body.classList.add('exercise-active');
  panels.forEach((p) => p.setVisible(false));
  mixer.configure({ focus: -1, spatial: 'maximum', band: -1 });
  $('audio-spatial').value = 'maximum';
  $('audio-band').value = '-1';
  PATIENTS.forEach((_, i) => {
    mixer.patient(i, { gain: 1, muted: false });
    cards[i].querySelector('input').value = '100';
  });
  exerciseControls(true);
  refreshCards();
};
$('exercise-close').onclick = () => {
  clearTimeout(trialTimer);
  trialToken++;
  trialRunning = false;
  stopSources();
  inExercise = false;
  $('trial-answers').disabled = true;
  $('exercise').hidden = true;
  document.body.classList.remove('exercise-active');
  exerciseControls(false);
  panels[selected].setVisible(true);
  refreshCards();
};
$('trial-start').onclick = async () => {
  if (!inExercise || trialRunning) return;
  const token = ++trialToken;
  $('trial-start').disabled = true;
  try {
    await mixer.enable();
    if (!inExercise || token !== trialToken) return;
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
    trialStarted = performance.now();
    await Promise.all(
      spec.active.map((slot) =>
        panels[slot].demo({
          preload: 0,
          seed: trial + 101,
          changes: [
            { start: 8, end: 14, slots: spec.targets, band: spec.band },
          ],
        }),
      ),
    );
    if (token !== trialToken || !inExercise) return;
    $('trial-answers').disabled = false;
    $('trial-state').textContent =
      'Trial ' +
      (trial + 1) +
      ' of 8 · listening to ' +
      spec.active.map((i) => PATIENTS[i]).join(', ') +
      '.';
    trialTimer = setTimeout(() => {
      if (token !== trialToken) return;
      stopSources();
      $('trial-state').textContent =
        'Clip complete. Submit the patients you heard change.';
    }, 16000);
    refreshCards();
  } catch {
    if (token !== trialToken) return;
    trialRunning = false;
    $('trial-start').disabled = false;
    $('trial-state').textContent =
      'Sound could not start. Check browser sound permissions, then try again.';
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
  results.push(result);
  trialRunning = false;
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
    BANDS[result.band].name +
    ' (' +
    NOTES[result.band] +
    ')';
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
};
$('trial-export').onclick = () => {
  const url = URL.createObjectURL(
    new Blob(
      [
        JSON.stringify(
          { protocol: 'soniceeg-four-voices-v1', synthetic: true, results },
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
  if (document.hidden)
    message(
      'This tab is in the background. Capture may pause; stale measurements will fade from sound.',
    );
  else
    message(
      'Tab active. Check each patient for fresh measurements before continuing.',
    );
});
window.addEventListener('beforeunload', () => mixer.disable());
refreshCards();
