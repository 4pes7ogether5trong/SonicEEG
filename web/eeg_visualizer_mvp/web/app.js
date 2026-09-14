import { BANDS, CHANNELS, clamp, compareFrames, frameAt, location, powerDb } from './analysis.js';
import { makeRecording, parseRecording, parseCSV, serializableRecording } from './recordings.js';
import { Sonifier, audioVoices } from './audio.js';
import { SpectralField } from './field3d.js';
import { makeTrials, scoreTrials } from './protocol.js';

const $ = (id) => document.getElementById(id);
const state = {
  recording: null,
  frame: null,
  time: 2,
  playing: false,
  speed: 1,
  window: 2,
  selected: 'O1',
  mode: 'field',
  baseline: null,
  history: [],
  source: 'alert',
  audioEnabled: false,
  stream: false,
  lastFrameAt: 0,
  streamFrame: null,
  latestStreamFrame: null,
  study: null,
  imported: null,
  view19: false,
};
const cache = new Map(),
  sound = new Sonifier();
let lastAnimation = performance.now(),
  lastAnalysis = 0,
  pollBusy = false,
  streamRequest = 0,
  noticeTimer = null,
  importSequence = 0;
const fmt = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '—');
const signed = (n, d = 1) => (Number.isFinite(n) ? `${n > 0 ? '+' : ''}${n.toFixed(d)}` : '—');
const clock = (t) =>
  `${String(Math.floor(Math.max(0, t) / 60)).padStart(2, '0')}:${Math.floor(Math.max(0, t) % 60)
    .toString()
    .padStart(2, '0')}`;
const activeTrial = () => state.study?.trials[state.study.index];
const recording = (id) => {
  if (!cache.has(id)) cache.set(id, makeRecording(id));
  return cache.get(id);
};
function notice(message, persist = false) {
  $('notice').textContent = message;
  $('notice').hidden = !message;
  clearTimeout(noticeTimer);
  if (message && !persist)
    noticeTimer = setTimeout(() => {
      $('notice').hidden = true;
    }, 8000);
}
function setPlaying(playing) {
  state.playing = playing;
  $('play').textContent = playing ? 'Ⅱ Pause' : '▶ Play';
  $('play').setAttribute('aria-label', playing ? 'Pause recording' : 'Play recording');
  if (!playing) sound.silence();
  lastAnimation = performance.now();
  syncSound();
}
function visibleFrame(frame = state.frame) {
  return frame && state.view19
    ? { ...frame, channels: frame.channels.filter((c) => !CHANNELS.slice(19).includes(c.name)) }
    : frame;
}
function selectedChannel() {
  return visibleFrame()?.channels.find((c) => c.name === state.selected);
}
function sourceDescription() {
  const r = state.recording;
  if (!r) return;
  $('recording-description').textContent =
    r.description || `${r.channel_names.length} channels · ${r.reference}`;
  $('source-kind').textContent = r.synthetic
    ? 'SYNTHETIC DEMONSTRATION'
    : 'IMPORTED RECORDING · LOCAL ONLY';
}
function rebuildChannels() {
  const frame = visibleFrame();
  if (!frame) return;
  const names = frame.channels.map((c) => c.name);
  if (!names.includes(state.selected)) state.selected = names[0];
  $('channel').replaceChildren(
    ...names.map((name) => {
      const o = document.createElement('option');
      o.value = name;
      o.textContent = name;
      return o;
    }),
  );
  $('channel').value = state.selected;
}
function rebuildEpochs() {
  const r = state.recording;
  $('epochs').replaceChildren();
  if (!r || state.stream) return;
  const count = Math.min(r.epoch_count || Math.ceil(r.duration_s / 10), 100);
  $('epochs').style.gridTemplateColumns = `repeat(${Math.min(count, 10)},minmax(0,1fr))`;
  for (let i = 0; i < count; i++) {
    const button = document.createElement('button');
    button.textContent = `${String(i + 1).padStart(2, '0')} · ${i * 10}s`;
    button.title = `Go to epoch ${i + 1}`;
    button.onclick = () => seek(Math.min(r.duration_s, i * 10 + state.window));
    $('epochs').append(button);
  }
}
function setRecording(r, source) {
  notice('');
  document.querySelector('.workspace').hidden = false;
  setPlaying(false);
  streamRequest++;
  state.stream = false;
  state.source = source;
  state.recording = r;
  state.time = Math.min(state.window, r.duration_s);
  state.history = [];
  state.streamFrame = null;
  state.latestStreamFrame = null;
  state.lastFrameAt = 0;
  $('source').value = source;
  $('seek').disabled = false;
  $('window').disabled = false;
  $('speed').disabled = false;
  $('export-recording').disabled = false;
  $('study-open').disabled = false;
  $('play').disabled = false;
  sourceDescription();
  rebuildEpochs();
  updateFrame(true);
}
function seek(value) {
  if (state.study || state.stream) return;
  state.time = clamp(
    Number(value),
    Math.min(state.window, state.recording.duration_s),
    state.recording.duration_s,
  );
  state.history = [];
  updateFrame();
  lastAnimation = performance.now();
}
function historyEntry(frame) {
  return {
    end_s: frame.end_s,
    channels: frame.channels.map((c) => ({ name: c.name, spectrum: c.spectrum })),
  };
}
function updateFrame(rebuild = false) {
  if (!state.recording || state.stream) return;
  state.frame = frameAt(state.recording, state.time, state.window);
  state.time = state.frame.end_s;
  presentFrame(rebuild);
}
function presentFrame(rebuild = false) {
  const frame = state.frame;
  if (!frame) return;
  if (rebuild) rebuildChannels();
  const last = state.history.at(-1);
  if (last && frame.end_s < last.end_s) state.history = [];
  if (!last || Math.abs(frame.end_s - last.end_s) >= 0.2) {
    state.history.push(historyEntry(frame));
    state.history = state.history.filter((h) => h.end_s >= frame.end_s - 20).slice(-100);
  }
  if (!state.study) {
    $('seek').min = Math.min(state.window, state.recording?.duration_s || state.window);
    $('seek').max = state.recording?.duration_s || 100;
    $('seek').value = state.time;
    $('clock').textContent = state.stream
      ? `${clock(frame.end_s)} · live`
      : `${clock(state.time)} / ${clock(state.recording.duration_s)}`;
    [...$('epochs').children].forEach((e, i) =>
      e.classList.toggle(
        'current',
        i ===
          Math.min(
            Math.floor((state.time - 0.0001) / 10),
            Math.ceil(state.recording.duration_s / 10) - 1,
          ),
      ),
    );
    updateAnnotations();
  }
  const c = selectedChannel(),
    unit = c?.voltage_unit === 'uV' ? 'µV' : 'relative units';
  for (const option of $('trace-scale').options) option.textContent = `±${option.value} ${unit}`;
  $('power-scale-caption').textContent =
    `Dot radius: −30 to +30 dB re 1 ${c?.spectrum.unit || 'µV²/Hz'}`;
  $('measurement-note').textContent =
    `Hann periodogram · 0.5–${Math.min(45, frame.sample_rate_hz / 2)} Hz · ${fmt(frame.window_seconds, 2)} s window · ${frame.sample_rate_hz} Hz sampling`;
  $('trace-caption').textContent =
    `${frame.channels.length} acquired / ${visibleFrame().channels.length} visible · ${frame.sample_rate_hz} Hz · ±${$('trace-scale').value} ${unit} · ${$('dc-remove').checked ? 'window mean removed' : 'original DC retained'}`;
  renderInspector();
  renderComparison();
  drawTraces();
  updateField();
  syncSound();
}
function updateAnnotations() {
  const show = $('annotations').checked && !state.study;
  $('event-text').textContent = show
    ? state.frame.annotations?.map((e) => e.label).join(' · ') ||
      'No programmed event in this window'
    : 'Annotations hidden';
  if (state.stream) {
    $('event-text').textContent = 'Local source · no inferred event labels';
    return;
  }
  if (!state.recording.synthetic)
    $('event-text').textContent = 'Imported signal · no inferred event labels';
}
function updateField() {
  if (!state.frame) return;
  const trial = activeTrial(),
    allowed = !state.study || trial?.condition.visual || state.study.finished;
  field.setVisible(allowed);
  $('condition-cover').hidden = allowed;
  document.body.classList.toggle('raw-only', !allowed);
  const match = compareFrames(state.baseline, state.frame, state.selected);
  field.update(visibleFrame(), {
    selected: state.selected,
    mode: state.mode,
    history: state.history,
    baseline: match.valid ? visibleFrame(state.baseline) : null,
  });
}
function renderInspector() {
  const c = selectedChannel();
  if (!c) return;
  const valid = c.spectrum?.valid;
  $('metric-peak').textContent = valid ? `${fmt(c.dominant_frequency_hz)} Hz` : '—';
  $('metric-rms').textContent = `${fmt(c.rms_amplitude)} ${c.voltage_unit === 'uV' ? 'µV' : 'rel'}`;
  $('metric-sef').textContent = valid ? `${fmt(c.spectral_edge_95_hz)} Hz` : '—';
  $('metric-rhythm').textContent = valid ? `${fmt(c.rhythmicity * 100, 0)}%` : '—';
  $('band-values').replaceChildren(
    ...BANDS.map((b) => {
      const row = document.createElement('div');
      row.className = 'band-row';
      const name = document.createElement('span');
      name.style.color = b.color;
      name.textContent = `${b.symbol} ${b.key}`;
      const bar = document.createElement('div');
      bar.className = 'bar';
      const fill = document.createElement('span');
      fill.style.background = b.color;
      fill.style.width = `${100 * (c.band_powers[b.key] || 0)}%`;
      bar.append(fill);
      const value = document.createElement('span');
      value.className = 'value';
      value.textContent =
        valid && b.low < state.frame.sample_rate_hz / 2
          ? `${fmt(c.band_power_absolute[b.key])}`
          : '—';
      value.title = `${fmt(c.band_powers[b.key] * 100)}% of 0.5–45 Hz power · ${c.voltage_unit}²`;
      row.append(name, bar, value);
      return row;
    }),
  );
  const flags = c.quality_flags || [];
  $('quality').textContent =
    `${valid ? 'Power in ' + (c.voltage_unit === 'uV' ? 'µV²' : 'relative²') + ' · nominal Δf ' + fmt(c.frequency_resolution_hz, 2) + ' Hz' : 'Spectrum unavailable'}${flags.length ? ' · ' + flags.map((f) => f.replaceAll('_', ' ')).join(', ') : ' · no integrity flags'}${!location(c.name).known ? ' · unmapped channel' : ''}${state.frame.sample_rate_hz < 90 ? ' · coverage ends at ' + fmt(state.frame.sample_rate_hz / 2) + ' Hz (Nyquist)' : ''}`;
  drawSpectrum();
}
function canvasContext(canvas, height) {
  const w = Math.max(100, canvas.parentElement.clientWidth - (canvas.id === 'spectrum' ? 0 : 0)),
    ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, w, h: height };
}
function drawSpectrum() {
  const c = selectedChannel();
  if (!c) return;
  const { ctx, w, h } = canvasContext($('spectrum'), 115),
    left = 29,
    right = w - 7,
    top = 8,
    bottom = h - 23;
  const x = (f) => left + ((f - 0.5) / 44.5) * (right - left),
    y = (p) => bottom - clamp((powerDb(p) + 30) / 60, 0, 1) * (bottom - top);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '9px ui-monospace, monospace';
  for (const db of [-30, 0, 30]) {
    const yy = bottom - ((db + 30) / 60) * (bottom - top);
    ctx.strokeStyle = '#243a46';
    ctx.beginPath();
    ctx.moveTo(left, yy);
    ctx.lineTo(right, yy);
    ctx.stroke();
    ctx.fillStyle = '#6f8e9d';
    ctx.fillText(`${db}`, 0, yy + 3);
  }
  for (const f of [1, 10, 20, 30, 40]) {
    ctx.fillStyle = '#7f9aa6';
    ctx.fillText(String(f), x(f) - 4, h - 8);
  }
  ctx.fillStyle = '#7997a5';
  ctx.fillText('Hz', w - 18, h - 8);
  ctx.fillText('dB', 0, h - 8);
  const plot = (channel, color, dashed) => {
    if (!channel?.spectrum?.valid) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.3;
    ctx.setLineDash(dashed ? [3, 3] : []);
    ctx.beginPath();
    channel.spectrum.frequency_hz.forEach((f, i) => {
      if (i === 0) ctx.moveTo(x(f), y(channel.spectrum.power_density[i]));
      else ctx.lineTo(x(f), y(channel.spectrum.power_density[i]));
    });
    ctx.stroke();
    ctx.setLineDash([]);
  };
  if (compareFrames(state.baseline, state.frame, state.selected).valid)
    plot(
      state.baseline.channels.find((a) => a.name === state.selected),
      '#637983',
      true,
    );
  plot(c, '#9bdfbd', false);
}
function drawTraces() {
  const frame = visibleFrame();
  if (!frame) return;
  const channels = frame.channels,
    row = 34,
    top = 21,
    height = top + row * channels.length + 23,
    { ctx, w } = canvasContext($('traces'), height),
    left = 53,
    right = w - 14,
    scale = Number($('trace-scale').value),
    remove = $('dc-remove').checked;
  ctx.fillStyle = '#0b1720';
  ctx.fillRect(0, 0, w, height);
  ctx.font = '10px ui-monospace, monospace';
  for (let t = 0; t <= 4; t++) {
    const x = left + ((right - left) * t) / 4;
    ctx.strokeStyle = '#233541';
    ctx.beginPath();
    ctx.moveTo(x, top - 5);
    ctx.lineTo(x, height - 19);
    ctx.stroke();
    ctx.fillStyle = '#71919e';
    const value = frame.timestamp_s + (frame.window_seconds * t) / 4 - (state.study ? 2 : 0);
    ctx.fillText(`${fmt(value, 1)} s`, Math.min(x - 10, right - 30), 12);
  }
  channels.forEach((c, index) => {
    const mid = top + index * row + row / 2,
      samples = c.trace_samples || [],
      n = samples.length;
    const selected = c.name === state.selected;
    if (selected) {
      ctx.fillStyle = '#14332b';
      ctx.fillRect(0, mid - row / 2, w, row);
    }
    ctx.fillStyle = selected ? '#c3f7d8' : '#8dafbd';
    ctx.fillText(c.name.slice(0, 8), 8, mid + 3);
    ctx.strokeStyle = '#1d323e';
    ctx.beginPath();
    ctx.moveTo(left, mid);
    ctx.lineTo(right, mid);
    ctx.stroke();
    ctx.strokeStyle = selected ? '#b3efcd' : '#76a2b5';
    ctx.lineWidth = 0.8;
    if (!n) {
      ctx.fillStyle = '#dfb18d';
      ctx.fillText(
        'Raw samples unavailable; upgrade the local pipeline to v2.',
        left + 10,
        mid + 3,
      );
      return;
    }
    const step = n / (right - left),
      mean = remove ? c.mean_voltage : 0,
      ys = (v) => mid - clamp((v - mean) / scale, -1, 1) * (row / 2 - 3);
    let clipped = false,
      connected = false;
    ctx.beginPath();
    if (step <= 1) {
      for (let i = 0; i < n; i++) {
        const v = samples[i];
        if (v === null || !Number.isFinite(v)) {
          connected = false;
          continue;
        }
        const x = left + (i / Math.max(1, n - 1)) * (right - left),
          y = ys(v);
        if (connected) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
        connected = true;
        if (Math.abs(v - mean) > scale) clipped = true;
      }
    } else {
      for (let pixel = 0; pixel < right - left; pixel++) {
        const a = Math.floor(pixel * step),
          b = Math.min(n, Math.ceil((pixel + 1) * step));
        let low = Infinity,
          high = -Infinity,
          gap = false;
        for (let i = a; i < b; i++) {
          const v = samples[i];
          if (v === null || !Number.isFinite(v)) {
            gap = true;
            continue;
          }
          low = Math.min(low, v);
          high = Math.max(high, v);
        }
        if (gap || low === Infinity) {
          connected = false;
          continue;
        }
        const x = left + pixel;
        ctx.moveTo(x, ys(low));
        ctx.lineTo(x, ys(high));
        if (Math.abs(low - mean) > scale || Math.abs(high - mean) > scale) clipped = true;
      }
    }
    ctx.stroke();
    if (clipped) {
      ctx.fillStyle = '#ed997b';
      ctx.fillRect(w - 7, mid - 9, 3, 18);
    }
    if (c.quality_flags?.includes('missing_samples')) {
      ctx.fillStyle = '#e2b686';
      ctx.fillText('gap', w - 36, mid + 3);
    }
  });
}
function renderComparison() {
  const result = compareFrames(state.baseline, state.frame, state.selected);
  $('clear-pin').hidden = !state.baseline;
  $('pin').textContent = state.baseline ? 'Replace reference A' : 'Pin current as A';
  $('comparison-values').replaceChildren();
  if (!result.valid) {
    $('comparison-summary').textContent = result.reason;
    return;
  }
  $('comparison-summary').textContent =
    `${state.selected} · A ${fmt(state.baseline.timestamp_s)}–${fmt(state.baseline.end_s)} s → B ${fmt(state.frame.timestamp_s)}–${fmt(state.frame.end_s)} s. RMS ${signed(result.rms_delta)} µV · peak ${signed(result.peak_delta)} Hz.`;
  const table = document.createElement('table');
  table.innerHTML =
    '<thead><tr><th>Band</th><th>A · µV²</th><th>B · µV²</th><th>B/A · dB</th></tr></thead>';
  const body = document.createElement('tbody'),
    a = state.baseline.channels.find((c) => c.name === state.selected),
    b = selectedChannel();
  for (const band of BANDS) {
    const row = document.createElement('tr');
    [
      band.key,
      fmt(a.band_power_absolute[band.key]),
      fmt(b.band_power_absolute[band.key]),
      signed(result.band_delta_db[band.key]),
    ].forEach((value, i) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      if (i === 3)
        cell.className = result.band_delta_db[band.key] > 0 ? 'delta-positive' : 'delta-negative';
      row.append(cell);
    });
    body.append(row);
  }
  table.append(body);
  $('comparison-values').append(table);
}
function syncSound() {
  const trial = activeTrial(),
    playing =
      state.playing &&
      !document.hidden &&
      (!state.stream || performance.now() - state.lastFrameAt < 2000),
    allowed = state.study ? !state.study.finished && trial?.condition.audio : state.audioEnabled;
  sound.muted = !(playing && allowed);
  sound.volume = Number($('volume').value);
  const focus = $('audio-mode').value === 'focus';
  const options = {
    mode: $('audio-mode').value,
    selected: focus || $('audio-isolate').checked ? state.selected : null,
    qualityGate: $('quality-gate').checked,
  };
  const available = audioVoices(visibleFrame(), options).some((v) => v.gain > 1e-12);
  sound.muted ||= !available;
  sound.update(visibleFrame(), options);
  $('audio-state').textContent = !sound.armed
    ? 'Off · start quietly'
    : !available
      ? 'Silent · no eligible calibrated signal'
      : sound.muted
        ? 'Silent · paused or disabled'
        : 'Playing · smoothed amplitude';
  $('audio-toggle').textContent = state.audioEnabled ? 'Mute sound' : 'Enable sound';
  $('audio-toggle').setAttribute('aria-pressed', String(state.audioEnabled));
}
function download(name, value, type = 'application/json') {
  const blob = new Blob([typeof value === 'string' ? value : JSON.stringify(value)], { type }),
    url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function mappingSettings() {
  return {
    version: 'soniceeg.mapping/2',
    window_seconds: state.window,
    sample_rate_hz: state.frame?.sample_rate_hz,
    voltage_scale: Number($('trace-scale').value),
    remove_dc: $('dc-remove').checked,
    channel_view: $('montage').value,
    selected_channel: state.selected,
    visual_mode: state.mode,
    power_display_db_range: [-30, 30],
    frequency_range_hz: [0.5, 45],
    audio_mode: $('audio-mode').value,
    audio_selected_only: $('audio-isolate').checked,
    audio_volume: Number($('volume').value),
    audio_quality_gate: $('quality-gate').checked,
    speed: state.speed,
  };
}
async function connectStream() {
  setPlaying(false);
  document.querySelector('.workspace').hidden = true;
  const request = ++streamRequest;
  state.stream = true;
  state.source = 'stream';
  state.history = [];
  state.streamFrame = null;
  state.latestStreamFrame = null;
  state.lastFrameAt = 0;
  $('source').value = 'stream';
  $('seek').disabled = true;
  $('window').disabled = true;
  $('speed').disabled = true;
  $('export-recording').disabled = true;
  $('study-open').disabled = true;
  $('study-panel').hidden = true;
  $('epochs').replaceChildren();
  $('source-kind').textContent = 'LOCAL PYTHON PIPELINE';
  $('recording-description').textContent = 'Waiting for a frame from this origin…';
  notice('Connecting to the local pipeline…');
  await pollStream(request);
}
async function pollStream(request = streamRequest) {
  if (!state.stream || pollBusy) return;
  pollBusy = true;
  try {
    const response = await fetch('./api/frame', {
      cache: 'no-store',
      signal: AbortSignal.timeout(1800),
    });
    if (!response.ok) throw new Error('No local pipeline is serving this page.');
    const payload = await response.json();
    if (request !== streamRequest || !state.stream) return;
    if (payload.error) throw new Error(payload.error);
    const frame = payload.frame;
    if (frame?.schema !== 'soniceeg.visual-frame/2')
      throw new Error('This interface requires the updated v2 Python pipeline.');
    if (
      state.streamFrame !== frame.frame_id ||
      state.latestStreamFrame?.generated_at !== frame.generated_at
    ) {
      const first = state.streamFrame === null;
      document.querySelector('.workspace').hidden = false;
      state.streamFrame = frame.frame_id;
      state.lastFrameAt = performance.now();
      frame.channels = frame.channels.map((c) => ({ ...c, ...location(c.name) }));
      state.latestStreamFrame = frame;
      state.recording = null;
      $('recording-description').textContent =
        `${frame.source_label} · ${frame.channels.length} channels · ${frame.sample_rate_hz} Hz`;
      $('event-text').textContent = 'Local source · no inferred event labels';
      $('play').disabled = false;
      notice('');
      if (state.playing || first) {
        state.frame = frame;
        state.time = frame.end_s;
        state.window = frame.window_seconds;
        $('window').value = String(frame.window_seconds);
        if (first) {
          rebuildChannels();
          setPlaying(true);
        }
        presentFrame(first);
      }
    }
    if (payload.status === 'complete') {
      setPlaying(false);
      notice('Local recording complete. The final window remains available.', true);
    } else if (performance.now() - state.lastFrameAt > 2000) {
      sound.silence();
      notice('Local stream is stale. Sound is muted until fresh frames arrive.', true);
    }
  } catch (error) {
    if (request !== streamRequest || !state.stream) return;
    sound.silence();
    setPlaying(false);
    $('recording-description').textContent = 'Disconnected · last received window is frozen';
    notice(
      `${error.message} Start “python -m eeg_visualizer_mvp” and open the address it prints, or select a demonstration here.`,
      true,
    );
  } finally {
    pollBusy = false;
  }
}

// Controlled feasibility task. Trial labels and truth never enter the visible frame.
function lockStudy(locked) {
  document.body.classList.toggle('protocol-running', locked);
  $('sound-controls').disabled = locked;
  $('trace-scale').disabled = locked;
  $('montage').disabled = locked;
  $('dc-remove').disabled = locked;
  $('mode-field').disabled = locked;
  $('mode-history').disabled = locked;
  $('help-open').disabled = locked;
}
async function startStudy() {
  if (state.stream || !state.recording) {
    notice('Choose a browser recording before starting the interface comparison.');
    return;
  }
  if (!field.ready) {
    notice(
      'The comparison requires a working 3D view. Wait for the renderer or use another browser.',
      true,
    );
    return;
  }
  try {
    await sound.arm();
  } catch (error) {
    notice(`The comparison requires audio: ${error.message}`, true);
    return;
  }
  const seed = Number($('study-seed').value);
  if (!Number.isInteger(seed) || seed < 1 || seed > 9999999) {
    notice('Choose a whole-number session seed from 1 to 9,999,999.');
    return;
  }
  state.study = {
    trials: makeTrials(Number($('study-group').value), seed),
    index: 0,
    results: [],
    seed,
    group: Number($('study-group').value),
    finished: false,
    before: {
      recording: state.recording,
      source: state.source,
      time: state.time,
      window: state.window,
      speed: state.speed,
      baseline: state.baseline,
    },
  };
  state.baseline = null;
  state.speed = 1;
  state.window = 2;
  $('study-setup').hidden = true;
  $('study-results').hidden = true;
  $('study-exports').hidden = true;
  $('study-active').hidden = false;
  $('study-close').textContent = 'End session';
  lockStudy(true);
  startTrial();
}
function startTrial() {
  const study = state.study,
    trial = activeTrial();
  if (!trial) return;
  setPlaying(false);
  const full = makeRecording(trial.dataset, trial.seed),
    fs = full.sample_rate_hz,
    start = trial.epoch * 10 - 2,
    end = trial.epoch * 10 + 10;
  state.recording = {
    ...full,
    id: `trial-${study.index + 1}`,
    label: `Trial ${study.index + 1}`,
    description: '',
    data: full.data.map((a) => a.subarray(start * fs, end * fs)),
    duration_s: 12,
    events: [],
  };
  state.time = 2;
  state.history = [];
  state.stream = false;
  study.awaiting = false;
  study.answered = false;
  study.start = performance.now();
  study.selections = [];
  trial.relative_clip_start_s = trial.epoch * 10;
  trial.context_start_s = start;
  $('trial-label').textContent =
    `Trial ${study.index + 1} of ${study.trials.length} · ${trial.condition.label}`;
  $('trial-clock').textContent = '00:00 / 00:10';
  $('trial-state').textContent = 'Observe the complete clip';
  $('trial-response').hidden = true;
  $('trial-next').hidden = true;
  $('confidence').value = '3';
  $('study-title').textContent = 'Does the focal rhythm evolve?';
  updateFrame(true);
  study.settings = mappingSettings();
  setPlaying(true);
}
function answerTrial(response) {
  const study = state.study;
  if (!study?.awaiting || study.answered) return;
  study.answered = true;
  const trial = activeTrial();
  study.results.push({
    trial: study.index + 1,
    condition: trial.condition.id,
    dataset: trial.dataset,
    seed: trial.seed,
    target: trial.target,
    response,
    confidence: Number($('confidence').value),
    response_seconds: (performance.now() - study.start) / 1000,
    decision_seconds_after_clip: (performance.now() - study.clipEnded) / 1000,
    clip_start_s: trial.relative_clip_start_s,
    context_start_s: trial.context_start_s,
    exposure_seconds: 10,
    settings: study.settings,
    channel_selections: study.selections,
  });
  $('trial-response').hidden = true;
  $('trial-state').textContent = 'Response recorded. Labels remain hidden until the session ends.';
  $('trial-next').hidden = false;
  $('trial-next').textContent =
    study.index === study.trials.length - 1 ? 'Finish and view results' : 'Next trial';
}
function finishStudy() {
  setPlaying(false);
  const study = state.study;
  study.finished = true;
  $('study-active').hidden = true;
  $('study-results').hidden = false;
  $('study-exports').hidden = false;
  $('study-title').textContent = `${study.results.length} trials recorded`;
  $('study-close').textContent = 'Return to exploration';
  const table = document.createElement('table');
  table.innerHTML =
    '<thead><tr><th>Condition</th><th>Trials</th><th>Hits</th><th>Misses</th><th>False alarms</th><th>Correct rejects</th><th>Median response</th></tr></thead>';
  const body = document.createElement('tbody');
  for (const r of scoreTrials(study.results)) {
    const tr = document.createElement('tr');
    [
      r.condition,
      r.n,
      r.hits,
      r.misses,
      r.false_positives,
      r.correct_rejections,
      `${fmt(r.median_response_seconds)} s`,
    ].forEach((value) => {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    });
    body.append(tr);
  }
  table.append(body);
  const p = document.createElement('p');
  p.textContent =
    'These counts describe a small synthetic exercise. With one target per condition, do not interpret differences as evidence of clinical superiority. Response time includes the fixed 10-second exposure. Exported trial data includes programmed truth, seeds and mapping settings.';
  $('study-results').replaceChildren(table, p);
}
function leaveStudy() {
  if (state.study) {
    setPlaying(false);
    const before = state.study.before;
    state.study = null;
    state.window = before.window;
    state.speed = before.speed;
    state.baseline = before.baseline;
    lockStudy(false);
    $('window').value = before.window;
    $('speed').value = before.speed;
    setRecording(before.recording, before.source);
    seek(before.time);
  }
  $('study-panel').hidden = true;
  $('study-setup').hidden = false;
  $('study-results').hidden = true;
  $('study-exports').hidden = true;
  $('study-active').hidden = true;
}
function studyExport() {
  const s = state.study;
  return {
    schema: 'soniceeg.interface-trials/1',
    generator_version: '0.2.0',
    protocol_version: '0.2.0',
    seed: s.seed,
    order_group: s.group,
    completed: s.results.length === s.trials.length,
    interpretation: 'Synthetic interface feasibility exercise, not diagnostic validation.',
    results: s.results,
    summary: scoreTrials(s.results),
  };
}

const field = new SpectralField(
  $('field'),
  (point) => {
    selectChannel(point.channel);
    $('point-readout').textContent =
      `${point.baseline ? 'Reference A · ' : ''}${point.channel} · ${fmt(point.frequency, 2)} Hz · ${fmt(point.power, 3)} ${selectedChannel()?.spectrum.unit || 'µV²/Hz'}${point.time !== undefined ? ' · ' + fmt(point.time) + ' s' : ''}`;
  },
  (backend) => {
    $('field-status').textContent = `3D · ${backend}`;
  },
);
function selectChannel(name) {
  state.selected = name;
  $('channel').value = name;
  if (state.study && !state.study.awaiting)
    state.study.selections.push({
      channel: name,
      at_seconds: (performance.now() - state.study.start) / 1000,
    });
  renderInspector();
  renderComparison();
  drawTraces();
  updateField();
  syncSound();
}
$('band-legend').replaceChildren(
  ...BANDS.map((b) => {
    const span = document.createElement('span'),
      dot = document.createElement('i');
    dot.style.background = b.color;
    span.append(dot, `${b.symbol} ${b.low}–${b.high} Hz`);
    return span;
  }),
);
$('source').onchange = () => {
  if ($('source').value === 'stream') connectStream();
  else
    setRecording(
      $('source').value === 'local' ? state.imported : recording($('source').value),
      $('source').value,
    );
};
$('play').onclick = () => {
  if (state.stream) {
    setPlaying(!state.playing);
    if (state.playing && state.latestStreamFrame) {
      state.frame = state.latestStreamFrame;
      state.time = state.frame.end_s;
      state.history = [];
      presentFrame();
    }
    return;
  }
  if (!state.playing && state.time >= state.recording.duration_s) {
    state.time = Math.min(state.window, state.recording.duration_s);
    state.history = [];
    updateFrame();
  }
  setPlaying(!state.playing);
};
$('speed').onchange = () => {
  state.speed = Number($('speed').value);
};
$('window').onchange = () => {
  state.window = Number($('window').value);
  state.time = Math.max(state.time, Math.min(state.window, state.recording.duration_s));
  state.history = [];
  updateFrame();
};
$('seek').oninput = (e) => seek(e.target.value);
$('channel').onchange = (e) => selectChannel(e.target.value);
$('annotations').onchange = updateAnnotations;
$('traces').onclick = (e) => {
  const rect = $('traces').getBoundingClientRect(),
    index = Math.floor((e.clientY - rect.top - 21) / 34),
    c = visibleFrame().channels[index];
  if (c) selectChannel(c.name);
};
for (const mode of ['field', 'history'])
  $('mode-' + mode).onclick = () => {
    state.mode = mode;
    for (const m of ['field', 'history']) {
      $('mode-' + m).classList.toggle('active', m === mode);
      $('mode-' + m).setAttribute('aria-pressed', String(m === mode));
    }
    $('field-detail').textContent =
      mode === 'field'
        ? 'Fixed channel layout · logarithmic frequency'
        : 'Selected channel · time / frequency / power';
    updateField();
  };
$('reset-camera').onclick = () => field.reset();
$('montage').onchange = () => {
  state.view19 = $('montage').value === '19';
  rebuildChannels();
  presentFrame();
};
$('trace-scale').onchange = () => presentFrame();
$('dc-remove').onchange = () => presentFrame();
$('pin').onclick = () => {
  state.baseline = structuredClone(state.frame);
  renderComparison();
  drawSpectrum();
  updateField();
};
$('clear-pin').onclick = () => {
  state.baseline = null;
  renderComparison();
  drawSpectrum();
  updateField();
};
$('audio-toggle').onclick = async () => {
  if (state.audioEnabled) {
    state.audioEnabled = false;
    sound.silence();
  } else {
    try {
      await sound.arm();
      state.audioEnabled = true;
    } catch (error) {
      notice(error.message, true);
    }
  }
  syncSound();
};
$('audio-mode').onchange = syncSound;
$('audio-isolate').onchange = syncSound;
$('quality-gate').onchange = syncSound;
$('volume').oninput = () => {
  $('volume-value').textContent = `${Math.round(Number($('volume').value) * 100)}%`;
  syncSound();
};
$('export-window').onclick = () =>
  download('soniceeg-window.json', {
    ...state.frame,
    mapping: mappingSettings(),
    comparison: state.baseline
      ? {
          reference: state.baseline,
          result: compareFrames(state.baseline, state.frame, state.selected),
        }
      : null,
  });
$('export-recording').onclick = () => {
  if (state.recording)
    download(
      state.recording.synthetic
        ? `soniceeg-${state.recording.kind}-100s.json`
        : 'soniceeg-recording.json',
      serializableRecording(state.recording),
    );
};
$('import-open').onclick = () => {
  setPlaying(false);
  $('import-dialog').showModal();
};
$('import-close').onclick = () => $('import-dialog').close();
$('import-form').onsubmit = async (e) => {
  e.preventDefault();
  $('import-error').textContent = '';
  try {
    const file = $('import-file').files[0];
    if (!file) throw new Error('Select a file.');
    if (file.size > 80 * 1024 * 1024)
      throw new Error('The browser limit is 80 MB. Use the Python pipeline for larger files.');
    const text = await file.text(),
      r = file.name.toLowerCase().endsWith('.json')
        ? parseRecording(JSON.parse(text))
        : parseCSV(text, Number($('import-rate').value), $('import-unit').value);
    r.id = `local-import-${++importSequence}`;
    if ($('import-reference').value.trim()) r.reference = $('import-reference').value.trim();
    state.imported = r;
    $('source').querySelector('[value="local"]').disabled = false;
    setRecording(r, 'local');
    $('import-dialog').close();
    notice('Recording opened locally. No samples were uploaded.');
  } catch (error) {
    $('import-error').textContent = error.message;
  }
};
$('help-open').onclick = () => {
  setPlaying(false);
  $('help-dialog').showModal();
};
$('help-close').onclick = () => $('help-dialog').close();
$('study-open').onclick = () => {
  setPlaying(false);
  $('study-panel').hidden = false;
  $('study-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
};
$('study-close').onclick = () => {
  if (state.study && !state.study.finished && state.study.results.length) finishStudy();
  else leaveStudy();
};
$('study-start').onclick = startStudy;
$('answer-yes').onclick = () => answerTrial(true);
$('answer-no').onclick = () => answerTrial(false);
$('trial-next').onclick = () => {
  if (state.study.index === state.study.trials.length - 1) finishStudy();
  else {
    state.study.index++;
    startTrial();
  }
};
$('export-study-json').onclick = () => download('soniceeg-interface-trials.json', studyExport());
$('export-study-csv').onclick = () => {
  const rows = state.study.results,
    headers = [
      'trial',
      'condition',
      'dataset',
      'seed',
      'target',
      'response',
      'confidence',
      'response_seconds',
      'decision_seconds_after_clip',
      'clip_start_s',
      'context_start_s',
      'exposure_seconds',
    ];
  download(
    'soniceeg-interface-trials.csv',
    [headers.join(','), ...rows.map((r) => headers.map((h) => r[h]).join(','))].join('\n'),
    'text/csv',
  );
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    sound.silence();
    if (state.study && !state.study.finished && !state.study.awaiting) {
      setPlaying(false);
      state.study.interrupted = true;
      $('trial-state').textContent =
        'Trial interrupted by a hidden tab. End this session and restart for comparable timing.';
    } else setPlaying(false);
  }
});
window.addEventListener('pagehide', () => sound.silence());
window.addEventListener('resize', () => {
  if (state.frame) {
    drawTraces();
    drawSpectrum();
  }
});
window.addEventListener('keydown', (e) => {
  if (
    e.code === 'Space' &&
    !state.study &&
    !document.querySelector('dialog[open]') &&
    !['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA'].includes(document.activeElement.tagName)
  ) {
    e.preventDefault();
    $('play').click();
  }
});
function animate(now) {
  const dt = Math.min((now - lastAnimation) / 1000, 0.25);
  lastAnimation = now;
  if (state.playing && !state.stream && !document.hidden) {
    state.time = Math.min(
      state.recording.duration_s,
      state.study ? 2 + (now - state.study.start) / 1000 : state.time + dt * state.speed,
    );
    if (now - lastAnalysis >= 250 || state.time >= state.recording.duration_s) {
      lastAnalysis = now;
      updateFrame();
    }
    if (state.study) {
      $('trial-clock').textContent = `${clock(state.time - 2)} / 00:10`;
    }
    if (state.time >= state.recording.duration_s) {
      setPlaying(false);
      if (state.study) {
        state.study.awaiting = true;
        state.study.clipEnded = performance.now();
        $('trial-state').textContent = 'Clip complete · record your response';
        $('trial-response').hidden = false;
      }
    }
  }
  if (state.stream && state.playing && now - state.lastFrameAt > 2000) sound.silence();
  requestAnimationFrame(animate);
}
setRecording(recording('alert'), 'alert');
field
  .init()
  .then(() => updateField())
  .catch((error) => {
    $('field-status').textContent = '3D unavailable';
    $('field-unavailable').hidden = false;
    $('field-unavailable').textContent =
      'This browser could not start WebGPU or WebGL 2. Raw traces, the measured spectrum, sound and exports remain available.';
    notice(`3D renderer: ${error.message}`);
  });
setInterval(() => {
  if (state.stream) pollStream();
}, 500);
requestAnimationFrame(animate);
// The Python entry point serves this same bundle. Detect only a localhost origin;
// a failed stream never silently changes to synthetic data.
if (['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) connectStream();
