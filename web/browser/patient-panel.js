import { ChannelCoverage } from './channel-coverage.js';
import { TraceMonitor } from './trace-monitor.js';
import { drawTraceMonitor, traceDisplayScale } from './trace-view.js';
import { recentTraceQuality } from './capture-quality.js';
import { captureStatusMessage } from './capture-status.js';
import { BANDS, AMPLITUDE_THRESHOLDS, prevalence } from './signal.js';
import { parseDerivation, recognizeMontage } from './montage.js';
import { suggestMontageLabels } from './montage-inference.js';
import { TemporalHistory, LocalArchive, summarizeFrames } from './history.js';
import { FeaturePipeline } from './pipeline.js';
import {
  inferCaptureRegions,
  labelWatchReference,
  labelsChanged,
  nativeCaptureRect,
  rowsInArea,
} from './capture-layout.js';
import { labelCheckReport } from './capture-report.js';
import {
  enteredChannels,
  positionedChannels,
  startCaptureWithSound,
  channelFieldText,
} from './capture-setup.js';
import { BrowserCapture } from './capture.js';
import { FluidField } from './field.js';
import { recentWaveforms } from './waveform.js';
import { FluidEpisodes, visibleDroplets, mergeDroplets, PATTERN_NAMES } from './fluid-episodes.js';
import { patientDemoBlock, DEMO_LENGTH } from './demo.js';
import {
  showcaseBlock,
  showcasePhase,
  SHOWCASE_LENGTH,
  SAMPLER_LABELS,
  SEIZURE_INTERVALS,
} from './showcase.js';
import { BaselineMap, BaselineWindow } from './baseline.js';
import { extractTraces, readableSections } from './pixels.js';
import { settingsDifference, settingsWatchReference, validFilters } from './display-settings.js';
export function mountPatient(
  root,
  audio,
  slot,
  onState = () => {},
  createCapture = () => new BrowserCapture(),
) {
  let visible = false,
    preloading = false,
    field = null,
    visualsEnabled = true;
  const $ = (id) => root.querySelector('[data-id="' + id + '"]'),
    text = (id, value, error = false) => {
      $(id).textContent = value;
      if (id === 'setup-status') {
        $('start-status').textContent = value;
        $('start-status').classList.toggle('error', error);
        $('start-status').setAttribute('role', error ? 'alert' : 'status');
      }
    };
  const capture = createCapture(),
    archive = new LocalArchive(),
    baselineMap = new BaselineMap(),
    baselineWindow = new BaselineWindow(),
    episodes = new FluidEpisodes(),
    captureCoverage = new ChannelCoverage(),
    traceMonitor = new TraceMonitor();
  let coverageArrival = null,
    coverageStopped = null,
    traceArrival = null;
  let history = new TemporalHistory(),
    source = 'none',
    active = false,
    paused = false,
    mode = 'live',
    band = -1,
    selected = '',
    lastFrame = null,
    timer = null,
    worker = null,
    workerResponseTimer = null,
    busy = false,
    segment = 0,
    localId = null,
    persistQueue = Promise.resolve(),
    storageReady = false,
    reading = false,
    starting = false,
    labelReadId = 0,
    labelsDirty = false,
    manualMapping = false,
    labelColumn = null,
    regions = {},
    roi = 'area',
    selectionVersion = 0,
    previewTimer = null,
    drag = null,
    ocrRows = [],
    ocrLabels = '',
    labelReport = '',
    lastDetected = null,
    confirmedDisplay = null,
    watchedDisplay = {},
    filterOnlyEligible = false,
    dimensions = [],
    watchAt = 0,
    calibration = null,
    historyDetail = null,
    restoreToken = 0,
    pendingNewSession = false,
    sessionToken = 0,
    operation = 0,
    reviewStarted = null,
    watchedLabels = null,
    frozenFrame = null,
    frozenFrames = null,
    frozenRecent = null,
    frozenEnd = 0,
    demoKind = 'guided';
  function ensureField() {
    field ||= new FluidField(
      $('stage'),
      (name) => {
        $('channel').value = name;
        selected = name;
        render();
      },
      (status) => {
        text('renderer-state', status);
        if (status.startsWith('Software')) $('fly').disabled = true;
      },
      (episode) => {
        paused = false;
        text('pause', 'Freeze view');
        $('pause').setAttribute('aria-pressed', 'false');
        $('follow').checked = false;
        const onset = episode.exampleStart ?? episode.start;
        $('time').value = String(
          Math.min(history.end, onset + Math.min(2, Math.max(0.5, (episode.end - onset) / 2))),
        );
        text(
          'episode-info',
          `${PATTERN_NAMES[episode.kind]} · ${episode.region} · ${format(episode.start)}–${format(episode.end)}${episode.aggregate ? ' · history cluster' : ''}`,
        );
        $('episode-info').hidden = false;
        selectTime();
      },
    );
    field.visible = visible && visualsEnabled;
    return field;
  }
  const format = (s) => {
    s = Math.max(0, s || 0);
    return s >= 3600
      ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(Math.floor(s) % 60).padStart(2, '0')}`
      : `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`;
  };
  const number = (id) => ($(id).value.trim() === '' ? null : Number($(id).value));
  function status(message, error = false) {
    onState({
      source,
      active,
      message,
      error,
      hasCapture: Boolean(capture.stream),
    });
    text('capture-status', message);
    $('capture-status').classList.toggle('error', error);
  }
  function settings() {
    return {
      hp: number('hp'),
      lp: number('lp'),
      notch: $('notch').value === 'unknown' ? null : $('notch').value,
      secondsPerCrop: number('seconds'),
      uvPerPixel: number('uv'),
    };
  }
  function context(frame) {
    const s = frame?.settings || {};
    text(
      'filter-state',
      `HP ${s.hp ?? '?'} Hz · LP ${s.lp ?? '?'} Hz · notch ${s.notch ?? '?'}${s.secondsPerCrop != null ? ` · ${s.secondsPerCrop}s/crop · ${s.uvPerPixel} µV/px` : ''}${frame?.mixed ? ' · mixed settings: expand time' : ''}`,
    );
  }
  function newHistory(kind, save = true) {
    baselineMap.clear();
    baselineWindow.clear();
    captureCoverage.reset();
    traceMonitor.reset();
    traceArrival = null;
    coverageArrival = coverageStopped = null;
    renderCoverage();
    episodes.reset();
    $('episode-info').hidden = true;
    $('demo-events').hidden = true;
    sessionToken++;
    history = new TemporalHistory();
    source = kind;
    lastFrame = null;
    historyDetail = null;
    localId = null;
    paused = false;
    selected = '';
    text('pause', 'Freeze view');
    $('pause').setAttribute('aria-pressed', 'false');
    $('follow').checked = true;
    context(null);
    $('empty').hidden = false;
    field?.update([], { total: 0 });
    $('channel').replaceChildren(new Option('All observed channels', ''));
    if (save && $('save-local').checked) return beginSave();
  }
  async function beginSave() {
    if (!storageReady) {
      text('storage-state', 'Local storage is unavailable. History remains in memory.');
      return;
    }
    const token = sessionToken;
    try {
      const id = await archive.create('Patient ' + 'ABCD'[slot] + ' · ' + source);
      if (token !== sessionToken) return;
      localId = id;
      await refreshSessions();
      text('storage-state', 'Saving new quantitative frames on this device.');
    } catch {
      localId = null;
      text('storage-state', 'Could not create a local session. History remains in memory.');
    }
  }
  function receive(frame) {
    if (frame.start < history.end - 1e-5) {
      status('An overlapping interval was rejected.', true);
      return;
    }
    captureCoverage.ingest(frame);
    coverageArrival = performance.now() / 1000;
    coverageStopped = null;
    renderCoverage();
    // Every accepted interval carries its capture context. No screenshot bytes are retained.
    baselineWindow.ingest(frame);
    baselineMap.apply(frame);
    frame.droplets = episodes.update(frame);
    if (frame.waveform) frame.waveform.droplets = frame.droplets;
    history.add(frame);
    lastFrame = frame;
    if (localId && $('save-local').checked) {
      const id = localId;
      persistQueue = persistQueue
        .then(() => archive.append(frame, id))
        .catch(() => {
          if (localId !== id) return;
          localId = null;
          $('save-local').checked = false;
          text(
            'storage-state',
            'Local save failed or storage is full. New history is memory-only.',
          );
        });
    }
    if (active && !preloading) audio.ingest(slot, frame);
    if (!paused && !preloading) render();
  }
  function renderCoverage() {
    const liveState = audio.live.status(slot);
    const lost = ['gap', 'stale', 'review', 'stopped'].includes(liveState);
    const extra =
      coverageArrival == null || source !== 'screen'
        ? 0
        : Math.max(0, (coverageStopped ?? performance.now() / 1000) - coverageArrival);
    const rows = captureCoverage.snapshot(extra > 2.5 || lost ? extra : 0);
    const current = rows.filter((r) => r.current && !lost).length;
    const traceAge =
      traceArrival == null
        ? 0
        : Math.max(0, (coverageStopped ?? performance.now() / 1000) - traceArrival);
    const traces = traceMonitor.snapshot(traceAge > 2.5 || !active ? traceAge : 0);
    const byName = new Map(traces.map((r) => [r.name, r]));
    const quality = recentTraceQuality(traces);
    $('capture-quality').hidden = source !== 'screen';
    const fresh = active && traceAge < 2.5;
    text(
      'capture-quality-title',
      !active
        ? 'Capture stopped'
        : !quality.expectedSeconds
          ? 'Waiting for newly captured columns'
          : !fresh
            ? 'Waiting for fresh capture'
            : quality.duration < 2
              ? 'Building the first analysis window'
              : !current
                ? 'Trace fragments only · analysis unavailable'
                : current < rows.length
                  ? `Partial coverage · ${current}/${rows.length} channels ready for analysis`
                  : `${current}/${rows.length} channels ready for analysis`,
    );
    const qualityText = quality.expectedSeconds
      ? `Last ${quality.duration.toFixed(1)}s · ink ${(100 * quality.observed).toFixed(1)}% · repaired ${(100 * quality.repaired).toFixed(1)}% · missing ${(100 * quality.missing).toFixed(1)}%`
      : 'Waiting for newly captured columns';
    text('capture-quality-values', qualityText);
    $('capture-quality-bar').setAttribute('aria-label', qualityText);
    for (const [id, fraction] of [
      ['quality-ink', quality.observed],
      ['quality-repaired', quality.repaired],
      ['quality-missing', quality.missing],
    ])
      $(id).style.width = `${Math.max(0, Math.min(100, fraction * 100))}%`;
    $('capture-quality').classList.toggle('incomplete', current < rows.length || !fresh);
    $('capture-quality-advice').hidden = !active || quality.duration < 2 || current === rows.length;
    text(
      'coverage-summary',
      rows.length
        ? `${current}/${rows.length} channels usable · ${rows.length - current} unavailable`
        : 'Channel coverage · waiting for measurements',
    );
    $('coverage-summary').classList.toggle('missing', current < rows.length);
    text(
      'coverage-period',
      rows.length
        ? `Analysis coverage from ${format(captureCoverage.start)} · ${rows[0].elapsed.toFixed(1)}s elapsed. Ink and repaired samples are separate; neither verifies channel identity at overlaps. Missing samples stay in the denominator. Only complete, qualified windows count for analysis, dome and sound. Derived channels do not count.`
        : 'Coverage begins with capture. Quiet, valid measurements count as usable.',
    );
    const baseNames = audio.trackers[slot].baseline;
    text(
      'coverage-baseline',
      baseNames
        ? `Baseline: ${baseNames.size}/${rows.length} channels covered. Missing: ${
            rows
              .filter((r) => !baseNames.has(r.name))
              .map((r) => r.name)
              .join(', ') || 'none'
          }.`
        : 'Baseline: none pinned. Pin last 20s requires at least 3 usable seconds per channel.',
    );
    $('coverage-rows').replaceChildren(
      ...rows.map((r) => {
        const tr = document.createElement('tr');
        const trace = byName.get(r.name);
        const values = [
          r.name,
          r.current && !lost
            ? 'Usable'
            : trace?.current && active && traceAge < 2.5
              ? 'Trace only'
              : 'Unavailable',
          trace ? `${trace.percent.toFixed(1)}%` : '—',
          trace?.elapsed ? `${((100 * trace.repaired) / trace.elapsed).toFixed(1)}%` : '—',
          trace?.elapsed
            ? `${Math.max(0, 100 - (100 * (trace.ink + trace.repaired)) / trace.elapsed).toFixed(1)}%`
            : '—',
          `${r.percent.toFixed(1)}%`,
          `${r.usable.toFixed(1)}s`,
          `${r.longestGap.toFixed(1)}s`,
          trace ? `${trace.longestGap.toFixed(1)}s` : '—',
        ];
        for (const value of values) {
          const td = document.createElement('td');
          td.textContent = value;
          tr.append(td);
        }
        tr.classList.toggle('missing', !r.current || lost);
        return tr;
      }),
    );
    if ($('trace-inspection').open)
      drawTraceMonitor($('trace-canvas'), traces, {
        scale: traceDisplayScale(traces, Number($('trace-scale').value)),
      });
    const staleView =
      source === 'screen' && lost && mode === 'live' && $('follow').checked && !paused;
    $('stage').classList.toggle('capture-unavailable', staleView);
    $('coverage-view-warning').hidden = !staleView;
    return { current, total: rows.length };
  }
  $('trace-inspection').addEventListener('toggle', renderCoverage);
  $('trace-scale').addEventListener('change', renderCoverage);
  function visibleFrame() {
    if (paused && frozenFrame) return frozenFrame;
    return $('follow').checked
      ? lastFrame
      : historyDetail?.find(
          (f) => f.start <= Number($('time').value) && f.end > Number($('time').value),
        ) || history.select(Number($('time').value));
  }
  function render() {
    renderCoverage();
    if (!visible || !visualsEnabled) return;
    const field = ensureField();
    const f = visibleFrame();
    if (!f) return;
    const shownEnd = paused ? frozenEnd : history.end;
    $('empty').hidden = true;
    $('time').max = String(shownEnd);
    if ($('follow').checked) $('time').value = String(shownEnd);
    const focus = Number($('time').value),
      frequencyMap = $('color-mode').value === 'frequency',
      fluid = frequencyMap && $('surface-mode').value === 'fluid',
      relief = frequencyMap && $('surface-mode').value !== 'spectrum',
      frames =
        mode === 'recent'
          ? paused
            ? frozenRecent
            : recentWaveforms(historyDetail || history.bins(), focus)
          : mode === 'live'
            ? [f]
            : paused
              ? frozenFrames
              : historyDetail
                ? summarizeFrames(historyDetail)
                : history.overview(relief ? 8 : 16),
      threshold =
        !relief && $('statistic').value === 'prevalence'
          ? Number($('occupancy-threshold').value)
          : -1;
    $('surface-mode').disabled = !frequencyMap;
    $('color-off').disabled = !frequencyMap;
    $('statistic').disabled = !frequencyMap || relief || mode === 'recent';
    $('occupancy-threshold').disabled = threshold < 0 || !frequencyMap;
    $('scale').disabled = threshold >= 0 || !frequencyMap;
    const historyDrops =
      fluid && mode === 'live'
        ? mergeDroplets(
            (paused ? frozenFrames : history.bins())
              .filter((x) => x.end <= focus + 0.001)
              .flatMap((x) => x.droplets || []),
            [],
            Infinity,
          )
        : [];
    field.update(frames, {
      map: $('color-mode').value,
      mode: mode === 'recent' ? 'side' : mode,
      relief,
      fluid,
      animate: !paused && active && $('follow').checked,
      frozen: paused,
      dropletsFor: (frame) =>
        visibleDroplets(
          mode === 'live' ? historyDrops : frame.droplets || [],
          mode === 'live' ? focus : frame.end,
          { kind: $('pattern-kind').value, selected },
        ),
      monochrome: frequencyMap && $('color-off').checked,
      recent: mode === 'recent',
      rangeStart: mode === 'recent' ? frames[0]?.start || 0 : 0,
      band,
      selected,
      scale: Number($('scale').value),
      lens: Number($('time-lens').value),
      focus,
      total: mode === 'recent' ? frames.at(-1)?.end || focus : shownEnd,
      cut: Number($('cut').value) >= 4 ? 20 : Number($('cut').value),
      peaks: !relief && mode !== 'live' && mode !== 'recent' && $('statistic').value === 'peaks',
      threshold,
    });
    text('clock', format(focus));
    text(
      'map-legend',
      $('color-mode').value === 'frequency'
        ? fluid
          ? 'Ripples = waveform · hatching = unavailable region · faint droplets = history'
          : relief
            ? 'Relief = signed waveform · ' +
              ($('color-off').checked ? 'color off' : 'color = strongest band')
            : ($('color-off').checked ? 'Color off' : 'Color = strongest band') +
              ' · white ring = sharp candidate'
        : $('color-mode').value === 'change'
          ? 'Baseline Δ · blue = less · orange = more · full color = 12 dB'
          : 'Changed time · dark 0% → orange 100% · ≥6 dB',
    );
    text(
      'baseline-status',
      baselineMap.reference
        ? 'Fixed baseline pinned · future intervals compared'
        : 'Pin baseline to compare future intervals.',
    );
    const scripted = source === 'demo' && demoKind === 'showcase' && mode !== 'live';
    $('demo-events').hidden = !scripted;
    if (scripted) {
      $('demo-event-track').replaceChildren(
        ...SEIZURE_INTERVALS[slot]
          .filter(([start]) => start < shownEnd)
          .map(([start, end]) => {
            const marker = document.createElement('span');
            marker.style.left = (start / shownEnd) * 100 + '%';
            marker.style.width = ((Math.min(end, shownEnd) - start) / shownEnd) * 100 + '%';
            marker.title = format(start) + '–' + format(Math.min(end, shownEnd)) + ' · programmed';
            return marker;
          }),
      );
    }
    text('elapsed', format(history.end));
    text(
      'resolution',
      `${format(f.start)}–${format(f.end)} · ${f.leaves > 1 ? 'compressed summary' : 'quantitative frame'}${f.gaps ? ' · capture gap' : ''}${relief ? (f.waveform ? ` · ${f.leaves > 1 ? 'example' : 'waveform'} ${format(f.waveform.start)}–${format(f.waveform.end)}` : ' · waveform unavailable') : ''}`,
    );
    text(
      'view-label',
      `${source === 'demo' ? 'SYNTHETIC · ' : ''}${mode === 'recent' ? `${frames.length} retained windows · older → newer` : mode === 'side' ? (relief ? 'Representative 2-second windows' : '') : mode === 'history' ? 'Center = recent · outward = older' + (relief ? ' · example windows' : '') : fluid ? 'Ripple distance = recent time · ' + $('scale').value + ' µV ruler' : relief ? 'Two-second waveform · ' + $('scale').value + ' µV ruler' : frequencyMap ? 'Two-second spectrum · ' + $('scale').value + ' µV ruler' : 'Two-second spectrum · fixed baseline'}${f.mixed ? ' · mixed settings' : ''}`,
    );
    const old = $('channel').value,
      names = f.channels.map((c) => c.name);
    if (
      names.join() !==
      Array.from($('channel').options)
        .slice(1)
        .map((o) => o.value)
        .join()
    ) {
      $('channel').replaceChildren(
        new Option('All observed channels', ''),
        ...names.map((n) => new Option(n, n)),
      );
      if (names.includes(old)) $('channel').value = old;
      else selected = '';
    }
    const c =
      f.channels.find((c) => c.name === selected) ||
      f.channels.filter((c) => c.valid).sort((a, b) => b.rms - a.rms)[0];
    const base = c?.valid && c.baseline?.validSeconds && !c.baseline.mixed ? c.baseline : null;
    text(
      'baseline-metrics',
      base
        ? `${c.name} · ${((100 * (band >= 0 ? base.changedSeconds[band] : base.anyChangedSeconds)) / base.validSeconds).toFixed(1)}% changed · ${base.validSeconds.toFixed(1)} compared seconds`
        : 'No compatible baseline comparison in this interval.',
    );
    if (c) {
      text(
        'channel-metrics',
        `${selected || 'Largest RMS: ' + c.name} · ${c.valid ? c.rms.toFixed(1) + ' µV RMS · peak ' + (Number.isFinite(c.peakHz) ? c.peakHz.toFixed(1) + ' Hz' : 'unavailable') : 'unavailable'}`,
      );
      text(
        'coverage',
        `${c.status} · ${c.validSeconds?.toFixed(1) || 0} valid seconds in this interval${c.unknownFilters ? ' · filter response unknown' : ''}${
          c.affected?.some(Boolean)
            ? ` · affected bands: ${BANDS.filter((_, i) => c.affected[i])
                .map((b) => b.short)
                .join(', ')}${field.software ? '' : ' (hatched)'}`
            : ''
        }`,
      );
    } else {
      text('channel-metrics', 'No valid measurements in this interval');
      text(
        'coverage',
        f.mixed
          ? 'Different recording settings meet here. Expand time to inspect.'
          : 'Capture gap or unavailable channels.',
      );
    }
    $('availability').replaceChildren(
      ...f.channels.map((c) => {
        const li = document.createElement('li');
        li.textContent = `${c.name} · ${c.status === 'expected' ? 'expected, not visible' : c.valid ? c.status : 'unavailable'}${c.labelInferred ? ' · label inferred' : ''}${c.from ? ' via ' + c.from.join(', ') : ''}`;
        li.classList.toggle('missing', !c.valid);
        return li;
      }),
    );
    if (threshold >= 0) {
      $('view-label').textContent +=
        ` · brightness = time at band RMS ≥ ${AMPLITUDE_THRESHOLDS[threshold]} µV`;
      if (c?.valid)
        $('coverage').textContent +=
          ' · ' +
          BANDS.map((b, i) => {
            const p = prevalence(c, i, threshold);
            return `${b.short} ${p == null ? 'unavailable' : (100 * p).toFixed(1) + '%'}`;
          }).join(' / ');
    }
    context(f);
  }
  function stop() {
    coverageStopped ??= performance.now() / 1000;
    operation++;
    restoreToken++;
    active = false;
    preloading = false;
    clearInterval(timer);
    timer = null;
    worker?.terminate();
    worker = null;
    clearTimeout(workerResponseTimer);
    busy = false;
    reading = false;
    starting = false;
    labelReadId++;
    clearInterval(previewTimer);
    drag = null;
    calibration = null;
    capture.stop();
    clearLabelInspection();
    $('setup-preview').width = 0;
    $('recognize').disabled = false;
    $('begin').disabled = false;
    $('begin').textContent = 'Start capture + sound';
    $('capture-sound').hidden = true;
    audio.stop(slot);
    renderCoverage();
    $('stop').hidden = true;
    $('setup-again').hidden = true;
    $('filters-quick').hidden = true;
    confirmedDisplay = null;
    watchedDisplay = {};
    text('settings-watch', 'Automatic settings check inactive.');
    filterOnlyEligible = false;
    status('Stopped. The captured history remains available.');
    text(
      'source-state',
      source === 'demo'
        ? 'Synthetic example · stopped'
        : source === 'none'
          ? 'No recording loaded'
          : 'Capture stopped',
    );
  }
  async function launchCapture() {
    stop();
    const token = operation;
    try {
      await capture.start(() => stop());
      if (token !== operation) return;
      pendingNewSession = true;
      reviewStarted = null;
      regions = {};
      roi = 'area';
      selectionVersion++;
      clearInterval(previewTimer);
      previewTimer = setInterval(() => {
        if ($('setup').open && !drag && !calibration) drawPreview();
      }, 500);
      ocrRows = [];
      ocrLabels = '';
      labelsDirty = false;
      manualMapping = false;
      labelColumn = null;
      lastDetected = null;
      clearLabelInspection();
      $('labels').value = '';
      updateRecognizedButton();
      for (const id of ['hp', 'lp']) $(id).value = '';
      $('notch').value = 'unknown';
      $('confirmed').checked = false;
      dimensions = capture.dimensions();
      $('setup').showModal();
      text('setup-status', 'Draw your EEG box. You can correct the names before starting.');
      drawPreview();
      status('Select the source regions and confirm the capture setup.');
    } catch (e) {
      status(e.message || 'Window capture was cancelled or blocked.', true);
    }
  }
  function drawPreview(overlay = null) {
    const v = capture.video;
    if (!v.videoWidth) return;
    const c = $('setup-preview');
    c.width = Math.min(1200, v.videoWidth);
    c.height = Math.round((c.width * v.videoHeight) / v.videoWidth);
    c.style.width =
      Math.min(c.parentElement.clientWidth - 48, (window.innerHeight * 0.52 * c.width) / c.height) +
      'px';
    const ctx = c.getContext('2d');
    ctx.drawImage(v, 0, 0, c.width, c.height);
    for (const [name, r] of Object.entries(regions)) {
      if (
        name !== 'area' &&
        name !== 'plot' &&
        regions.area &&
        ['x', 'y', 'w', 'h'].every((k) => r[k] === regions.area[k])
      )
        continue;
      ctx.strokeStyle = {
        area: '#ffffff',
        plot: '#69e0c2',
        labels: '#8ec8ff',
        settings: '#f3bb75',
      }[name];
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x * c.width, r.y * c.height, r.w * c.width, r.h * c.height);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = '16px system-ui';
      ctx.fillText(name, r.x * c.width + 4, Math.max(18, r.y * c.height - 4));
    }
    if (overlay && regions.plot) {
      const r = regions.plot,
        sx = (r.w * c.width) / overlay.width,
        sy = (r.h * c.height) / overlay.height;
      ctx.fillStyle = '#ff8549';
      for (const row of overlay.rows)
        for (let x = 0; x < row.pixelY.length; x += 3)
          if (row.observed[x])
            ctx.fillRect(r.x * c.width + x * sx, r.y * c.height + row.pixelY[x] * sy, 2, 2);
    }
    if (regions.labels && regions.plot && ocrRows.length) {
      const names = $('labels')
        .value.split(/\n/)
        .map((s) => s.trim());
      ctx.font = '12px system-ui';
      ctx.lineWidth = 2;
      for (let i = 0; i < ocrRows.length; i++) {
        const parsed = parseDerivation(names[i] || '');
        const inferred = ocrRows[i].inferred && parsed?.name === ocrRows[i].name;
        if (parsed && !inferred) continue;
        const row = ocrRows[i],
          r = regions.labels;
        const x = (r.x + row.x0 * r.w) * c.width;
        const y = (r.y + row.y * r.h) * c.height;
        ctx.strokeStyle = ctx.fillStyle = '#ffb66f';
        ctx.strokeRect(
          x - 3,
          y - (row.height * r.h * c.height) / 2 - 3,
          (row.x1 - row.x0) * r.w * c.width + 6,
          row.height * r.h * c.height + 6,
        );
        ctx.fillText(`${inferred ? '≈' : '?'} ${i + 1}`, regions.plot.x * c.width + 8, y + 4);
      }
    }
  }
  function point(event) {
    const r = $('setup-preview').getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (event.clientY - r.top) / r.height)),
    };
  }
  $('setup-preview').addEventListener('pointerdown', (e) => {
    const p = point(e);
    if (calibration) {
      calibration.push(p);
      if (calibration.length === 2) {
        const pixels = Math.abs(calibration[1].y - calibration[0].y) * capture.video.videoHeight;
        if (pixels < 4) {
          text('setup-status', 'Calibration marks are too close together. Try again.');
        } else {
          $('uv').value = (Number($('cal-uv').value) / pixels).toFixed(4);
          text(
            'setup-status',
            `Calibration bar: ${pixels.toFixed(1)} pixels. Voltage scale updated.`,
          );
        }
        calibration = null;
      }
      return;
    }
    drag = p;
    $('setup-preview').setPointerCapture(e.pointerId);
  });
  $('setup-preview').addEventListener('pointermove', (e) => {
    if (!drag) return;
    drawPreview();
    const p = point(e),
      c = $('setup-preview'),
      ctx = c.getContext('2d');
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(
      Math.min(p.x, drag.x) * c.width,
      Math.min(p.y, drag.y) * c.height,
      Math.abs(p.x - drag.x) * c.width,
      Math.abs(p.y - drag.y) * c.height,
    );
    ctx.setLineDash([]);
  });
  $('setup-preview').addEventListener('pointerup', (e) => {
    if (!drag) return;
    const p = point(e);
    const selectedRect = {
      x: Math.min(p.x, drag.x),
      y: Math.min(p.y, drag.y),
      w: Math.abs(p.x - drag.x),
      h: Math.abs(p.y - drag.y),
    };
    drag = null;
    if (selectedRect.w > 0.005 && selectedRect.h > 0.005) {
      const r = nativeCaptureRect(selectedRect, capture.dimensions());
      selectionVersion++;
      if (roi === 'area') {
        regions = {};
        ocrRows = [];
        ocrLabels = '';
        if (!labelsDirty) $('labels').value = '';
        manualMapping = false;
        labelColumn = null;
        clearLabelInspection();
      }
      if (roi === 'labels') {
        ocrRows = [];
        ocrLabels = '';
        labelColumn = null;
        manualMapping = false;
      }
      if (roi === 'plot') delete regions.area;
      regions[roi] = r;
      updateRecognizedButton();
      $('confirmed').checked = false;
      drawPreview();
      if (roi === 'area' || (roi === 'labels' && (regions.area || regions.plot))) {
        readLabels();
        return;
      }
      text(
        'setup-status',
        `${roi} region selected. ${roi === 'plot' ? 'Next select the channel labels.' : roi === 'labels' ? 'Next select the display settings.' : 'Ready for local text recognition.'}`,
      );
    }
  });
  $('setup-preview').addEventListener('pointercancel', () => {
    drag = null;
  });
  root.querySelectorAll('[data-roi]').forEach(
    (b) =>
      (b.onclick = () => {
        roi = b.dataset.roi;
        root
          .querySelectorAll('[data-roi]')
          .forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      }),
  );
  function getRows() {
    const channels = enteredChannels($('labels').value);
    const rect = regions.labels || regions.area;
    if (!rect) throw new Error('Draw an EEG box or a box around the channel-name column first.');
    if (ocrRows.length !== channels.length || !regions.plot) {
      const positions = capture.locateRows(rect, {
        expectedCount: channels.length,
        column: labelColumn,
        anchors: ocrRows,
      });
      if (regions.area) {
        const layout = inferCaptureRegions(
          regions.area,
          rowsInArea(positions, rect, regions.area),
          capture.dimensions(),
        );
        regions.plot = nativeCaptureRect(layout.plot, capture.dimensions());
      }
      regions.labels = rect;
      ocrRows = positions;
      manualMapping = true;
      drawPreview();
    }
    const mapped = positionedChannels(
      channels,
      ocrRows,
      rect,
      regions.plot,
      capture.dimensions(),
      Number($('row-offset').value) || 0,
    );
    $('labels').value = channels.map((c) => c.name).join('\n');
    updateRecognizedButton();
    return mapped;
  }
  function updateRecognizedButton() {
    $('use-recognized').hidden = !ocrLabels.trim() || $('labels').value.trim() === ocrLabels.trim();
  }
  $('labels').addEventListener('input', () => {
    labelsDirty = Boolean($('labels').value.trim());
    updateRecognizedButton();
    text(
      'setup-status',
      labelsDirty
        ? 'Typed names will be used. Start checks their positions against the captured rows.'
        : ocrLabels.trim()
          ? 'Use recognized names to restore the read, or enter one channel per line.'
          : 'Names will appear here when the read finishes. You can also enter them manually.',
    );
  });
  $('use-recognized').onclick = () => {
    $('labels').value = ocrLabels;
    labelsDirty = false;
    updateRecognizedButton();
    text('setup-status', 'Recognized names restored. Check the rows, then start capture.');
  };
  function clearLabelInspection() {
    labelReport = '';
    $('label-inspector').hidden = true;
    $('label-inspector').open = false;
    $('label-report-text').hidden = true;
    $('label-report-text').value = '';
    for (const id of ['label-source', 'label-contrast']) $(id).width = $(id).height = 0;
  }
  function showLabelInspection(result, suggestions) {
    labelReport = labelCheckReport(result, suggestions, capture.dimensions());
    $('label-inspector').hidden = false;
    $('copy-label-report').textContent = 'Copy label check';
    $('label-report-text').hidden = true;
    const p = result.preview;
    if (p)
      for (const [id, data] of [
        ['label-source', p.original],
        ['label-contrast', p.contrast],
      ]) {
        const canvas = $(id);
        canvas.width = p.width;
        canvas.height = p.height;
        canvas.style.width = `${p.width * 2}px`;
        canvas.style.height = `${p.height * 2}px`;
        canvas.getContext('2d').putImageData(new ImageData(data, p.width, p.height), 0, 0);
      }
    const px = result.column?.glyphHeight;
    text(
      'label-quality',
      `${capture.dimensions().join(' × ')} capture${px ? ` · lettering about ${Math.round(px)} px high` : ''}.${px && px < 8 ? ' Enlarge the source window or its label font.' : ' Compare the captured names with the color contrast.'}`,
    );
  }
  $('copy-label-report').onclick = async () => {
    if (!labelReport) return;
    try {
      await navigator.clipboard.writeText(labelReport);
      $('copy-label-report').textContent = 'Label check copied';
    } catch {
      $('label-report-text').hidden = false;
      $('label-report-text').value = labelReport;
      $('label-report-text').select();
    }
  };
  $('adjust-label-box').onclick = () => {
    roi = 'labels';
    root
      .querySelectorAll('[data-roi]')
      .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.roi === roi)));
    text(
      'setup-status',
      'Draw a tight box around the channel-name column. It will read automatically.',
    );
  };
  async function readLabels() {
    if (!regions.area && (!regions.labels || !regions.plot)) {
      text('setup-status', 'Select waveform and label regions first.');
      return;
    }
    const version = capture.version,
      selection = selectionVersion,
      request = ++labelReadId;
    $('recognize').disabled = true;
    text('setup-status', 'Reading selected regions with the local OCR model…');
    try {
      const automatic = Boolean(regions.area);
      const labelRect = regions.labels || regions.area;
      const result = await capture.recognize(labelRect, regions.settings || regions.area, {
        inspect: true,
      });
      if (version !== capture.version || selection !== selectionVersion) return;
      const suggestions = suggestMontageLabels(result.rows);
      ocrRows = suggestions.rows;
      ocrLabels = ocrRows.map((r) => r.name).join('\n');
      labelsDirty &&= Boolean($('labels').value.trim());
      $('labels').value = channelFieldText($('labels').value, ocrLabels, labelsDirty);
      updateRecognizedButton();
      manualMapping = false;
      labelColumn = result.column;
      regions.labels = result.rect;
      showLabelInspection(result, suggestions);
      // Settings recognition is useful even when channel recognition is partial.
      lastDetected = result.settings;
      const s = result.settings;
      if (s) {
        if (s.seconds) $('seconds').value = s.seconds;
        for (const k of ['hp', 'lp']) if (s[k] != null) $(k).value = s[k];
        if (['off', '50', '60'].includes(s.notch)) $('notch').value = s.notch;
      }
      if (automatic) {
        if (result.rows.length < 4) {
          delete regions.plot;
          throw new Error(
            `Only ${result.rows.length} channel rows located. Open Check label capture to inspect the lettering or adjust its box.`,
          );
        }
        const layout = inferCaptureRegions(
          regions.area,
          rowsInArea(result.rows, result.rect, regions.area),
          capture.dimensions(),
        );
        regions.plot = nativeCaptureRect(layout.plot, capture.dimensions());
        regions.settings ||= regions.area;
      }
      drawPreview();
      const match = recognizeMontage(ocrRows.map((r) => r.name)),
        repaired = ocrRows.filter((r) => r.corrected).length,
        unresolved = ocrRows.filter((r) => r.name === '?').length;
      text(
        'setup-status',
        `${ocrRows.length - result.unresolved}/${ocrRows.length} names read${suggestions.inferred ? ` · ${suggestions.inferred} inferred from ${suggestions.montage}` : ` · ${match.name}`}. ${suggestions.inferred ? 'Check orange ≈ labels before starting. ' : ''}${unresolved ? 'Replace each ? in place. ' : repaired ? `${repaired} OCR spelling suggestions to check. ` : ''}Verify the displayed rows, green waveform box and scales.`,
      );
    } catch (e) {
      if (version === capture.version && selection === selectionVersion)
        text('setup-status', e.message, true);
    } finally {
      if (request === labelReadId) {
        $('recognize').disabled = false;
      }
    }
  }
  async function checkRows() {
    try {
      const rows = getRows(),
        c = capture.crop(regions.plot),
        ctx = c.getContext('2d', { willReadFrequently: true }),
        result = extractTraces(ctx.getImageData(0, 0, c.width, c.height), rows, {
          uvPerPixel: Number($('uv').value),
          negativeUp: $('polarity').value === 'up',
        });
      clearInterval(previewTimer);
      drawPreview({ width: c.width, height: c.height, rows: result });
      text(
        'setup-status',
        `Alignment snapshot: orange points show the extracted path. ${result.filter((c) => c.valid).length}/${result.length} rows pass the initial extraction check. Adjust region or baseline offset if needed.`,
      );
      c.width = 0;
      c.height = 0;
    } catch (e) {
      text('setup-status', e.message, true);
    }
  }
  async function begin() {
    const token = operation,
      version = capture.version;
    try {
      if (!capture.stream) throw new Error('Select a source window again.');
      if (!$('labels').value.trim()) {
        // A premature Start click must not cancel the result that will fill the
        // empty field. A completed read can be restored without another OCR job.
        if (ocrLabels.trim()) {
          $('labels').value = ocrLabels;
          labelsDirty = false;
          updateRecognizedButton();
        } else if ($('recognize').disabled) {
          throw new Error(
            'Reading channel names. Wait for the names to appear, or enter them manually.',
          );
        } else
          throw new Error(
            'No names read yet. Read the label area again or enter one channel per line.',
          );
      }
      // Starting confirms the visible input, including any error it produces.
      // A late OCR read must not replace that feedback after validation fails.
      selectionVersion++;
      // The start button confirms the visible setup; no redundant checkbox.
      const rows = getRows(),
        seconds = Number($('seconds').value),
        uvPerPixel = Number($('uv').value),
        s = settings();
      if (!(seconds > 0 && seconds <= 120 && uvPerPixel > 0 && uvPerPixel <= 100))
        throw new Error('Provide valid time and voltage scales.');
      if (s.hp != null && s.lp != null && s.hp >= s.lp)
        throw new Error('The high-pass cutoff must be below the low-pass cutoff.');
      const h = Math.round(regions.plot.h * capture.video.videoHeight);
      if (rows.some((r) => r.y < 0 || r.y >= h))
        throw new Error('Some label rows fall outside the waveform crop. Adjust the regions.');
      const preview = capture.crop(regions.plot);
      const extracted = extractTraces(
        preview
          .getContext('2d', { willReadFrequently: true })
          .getImageData(0, 0, preview.width, preview.height),
        rows,
        { uvPerPixel, negativeUp: $('polarity').value === 'up' },
      );
      const readable = readableSections(extracted, preview.width / seconds);
      preview.width = preview.height = 0;
      if (readable < Math.min(2, rows.filter((r) => !r.ignore).length))
        throw new Error(
          'Waveforms are not readable yet. Use Show extraction alignment under Fine-tune capture, then adjust the waveform region or row offset.',
        );
      const eegRows = rows.filter((r) => !r.ignore);
      const match = recognizeMontage(eegRows.map((r) => r.name));
      if (pendingNewSession) {
        await newHistory('screen');
        if (token !== operation || version !== capture.version) return;
        pendingNewSession = false;
      } else if (reviewStarted && history.count) {
        const gap = (performance.now() - reviewStarted) / 1000;
        receive({
          start: history.end,
          end: history.end + gap,
          source: 'screen',
          segment: 'review-gap',
          settings: {},
          channels: [],
          gaps: gap,
          leaves: 1,
        });
      }
      reviewStarted = null;
      watchedLabels =
        manualMapping ||
        labelsDirty ||
        ocrRows.some((r) => r.inferred || r.corrected) ||
        rows.some((r) => r.ignore)
          ? null
          : labelWatchReference(
              ocrRows,
              rows.map((r) => r.name),
            );
      confirmedDisplay = {
        ...s,
        seconds: lastDetected?.seconds ?? null,
        sensitivity: lastDetected?.sensitivity ?? null,
      };
      watchedDisplay = settingsWatchReference(confirmedDisplay, lastDetected);
      text(
        'settings-watch',
        Object.keys(watchedDisplay).length || watchedLabels
          ? 'Automatic check: ' +
              [
                ...Object.keys(watchedDisplay),
                ...(watchedLabels
                  ? [
                      `${watchedLabels.filter((r) => r.automatic).length}/${rows.length} channel labels`,
                    ]
                  : []),
              ].join(', ') +
              '. Inferred/corrected labels and other settings need manual review when the display changes.'
          : 'Settings are confirmed manually. Use Filters changed or full setup whenever the source display changes.',
      );
      // A synchronous worker failure must remain visible in the setup dialog.
      worker?.terminate();
      worker = new Worker(new URL('./signal-worker.js', import.meta.url), { type: 'module' });
      filterOnlyEligible = true;
      active = true;
      audio.begin(slot);
      captureCoverage.expect(eegRows.map((r) => r.name));
      traceMonitor.expect(eegRows.map((r) => r.name));
      coverageStopped = null;
      segment++;
      dimensions = capture.dimensions();
      historyDetail = null;
      clearInterval(previewTimer);
      $('setup').close();
      clearLabelInspection();
      $('stop').hidden = false;
      $('setup-again').hidden = false;
      $('filters-quick').hidden = false;
      text('source-state', 'Local window capture');
      text('montage-name', `${match.name} · ${eegRows.length} visible derivations`);
      status(`Capture started · readable sections in ${readable}/${eegRows.length} EEG rows.`);
      busy = true;
      worker.onmessage = ({ data: m }) => {
        if (token !== operation || !active) return;
        if (m.type === 'traces') {
          traceMonitor.ingest(m.block);
          traceArrival = performance.now() / 1000;
        }
        if (m.type === 'frame') receive(m.frame);
        if (m.type === 'status') {
          busy = false;
          clearTimeout(workerResponseTimer);
          renderCoverage();
          status(captureStatusMessage(m), (m.gap && !m.expectedRedraw) || m.usableChannels === 0);
          if (m.gap && !m.expectedRedraw) audio.unavailable(slot);
          else if (m.expectedRedraw && m.usableChannels === 0) audio.redraw?.(slot);
        }
        if (m.type === 'ready') {
          clearTimeout(workerResponseTimer);
          busy = false;
        }
        if (m.type === 'error') {
          busy = false;
          suspend(m.message);
        }
      };
      worker.onerror = () =>
        suspend('The local processing worker stopped. Review capture setup to restart.');
      worker.onmessageerror = () =>
        suspend(
          'Signal processing returned an unreadable result. Review capture setup to restart.',
        );
      expectWorkerResponse('Signal analysis did not start. Review capture setup and retry.', 5000);
      worker.postMessage({
        type: 'configure',
        offset: Math.max(history.end, traceMonitor.end),
        config: {
          rows,
          seconds,
          uvPerPixel,
          mode: $('progression').value,
          negativeUp: $('polarity').value === 'up',
          sweepInsetPixels: Math.max(
            0,
            Math.round(
              (regions.plot.x - (regions.area || regions.labels || regions.plot).x) * dimensions[0],
            ),
          ),
          settings: s,
          segment: String(segment),
          expected: match.expected,
        },
      });
      watchAt = performance.now();
      clearInterval(timer);
      timer = setInterval(captureTick, 500);
      return true;
    } catch (e) {
      text('setup-status', e.message, true);
      return false;
    }
  }
  function expectWorkerResponse(message, timeout = 15000) {
    clearTimeout(workerResponseTimer);
    const token = operation;
    workerResponseTimer = setTimeout(() => {
      if (token === operation && active && busy) suspend(message);
    }, timeout);
  }
  function suspend(reason, filtersOnly = false) {
    operation++;
    reading = false;
    filterOnlyEligible = filtersOnly;
    if (active) reviewStarted = performance.now();
    active = false;
    clearInterval(timer);
    worker?.terminate();
    worker = null;
    clearTimeout(workerResponseTimer);
    busy = false;
    audio.stop(slot, 'review');
    renderCoverage();
    text('source-state', 'Capture needs review');
    status(reason, true);
    $('setup-again').hidden = false;
  }
  function markUncertain() {
    const start = Math.max(0, history.end - 5);
    history.invalidateSince(start);
    captureCoverage.invalidateSince(start);
    traceMonitor.invalidateSince(start);
    baselineWindow.clear();
    baselineMap.clear();
    audio.trackers[slot].reset();
    if (localId) {
      const id = localId;
      persistQueue = persistQueue
        .then(() => archive.invalidateSince(id, start))
        .catch(() => text('storage-state', 'Could not update uncertainty in saved history.'));
    }
    render();
  }
  async function captureTick() {
    if (!active || busy || !worker) return;
    if (audio.enabled && audio.context?.state === 'running') $('capture-sound').hidden = true;
    const token = operation,
      version = capture.version;
    if (capture.dimensions().join() !== dimensions.join()) {
      suspend('The captured window changed size. Confirm the regions and calibration again.');
      return;
    }
    const labelRegion = watchedLabels ? regions.labels : null,
      settingsRegion = Object.keys(watchedDisplay).length ? regions.settings : null;
    if (!reading && performance.now() - watchAt > 5000 && (settingsRegion || labelRegion)) {
      reading = true;
      watchAt = performance.now();
      void (async () => {
        try {
          const checked = labelRegion
              ? await capture.recognize(labelRegion, settingsRegion)
              : {
                  rows: null,
                  settings: await capture.settings(settingsRegion),
                },
            next = checked.settings;
          if (token !== operation || version !== capture.version || !active) return;
          const difference = settingsRegion
            ? settingsDifference(watchedDisplay, next)
            : { needsReview: false, changed: [], unreadable: [] };
          const layoutChanged = labelsChanged(watchedLabels, checked.rows);
          if (difference.needsReview || layoutChanged) {
            markUncertain();
            suspend(
              `${layoutChanged ? 'Channel labels or row positions changed or became unreadable.' : `Automatic check: ${difference.changed.length ? `${difference.changed.join(', ')} changed. ` : ''}${difference.unreadable.length ? `${difference.unreadable.join(', ')} could not be read.` : ''}`} Review capture setup to confirm the display; recent frames are marked uncertain.`,
              !layoutChanged &&
                difference.unreadable.length === 0 &&
                difference.changed.every((k) => ['hp', 'lp', 'notch'].includes(k)),
            );
            $('confirmed').checked = false;
            lastDetected = next;
            return;
          }
          // Preserve confirmed values through absent/unreadable OCR results.
        } catch {
          if (token === operation && version === capture.version) {
            markUncertain();
            suspend(
              'The display could not be rechecked. Review the source display and capture setup.',
            );
          }
          return;
        } finally {
          if (token === operation && version === capture.version) reading = false;
        }
      })();
    }
    if (!active || !worker) return;
    try {
      const c = capture.crop(regions.plot),
        image = c
          .getContext('2d', { willReadFrequently: true })
          .getImageData(0, 0, c.width, c.height);
      busy = true;
      expectWorkerResponse(
        'Signal processing stopped responding. Use a smaller waveform region or fewer channels, then review capture setup to restart.',
      );
      worker.postMessage(
        {
          type: 'pixels',
          wall: performance.now() / 1000,
          width: image.width,
          height: image.height,
          buffer: image.data.buffer,
        },
        [image.data.buffer],
      );
      c.width = 0;
      c.height = 0;
    } catch {
      suspend('The captured window is unavailable. Re-select the source window.');
    }
  }
  async function demo({
    preload = 0,
    changes = null,
    seed = 1,
    duration = DEMO_LENGTH,
    showcase = false,
  } = {}) {
    stop();
    const token = operation;
    await newHistory('demo');
    if (token !== operation) return;
    demoKind = showcase ? 'showcase' : 'guided';
    active = true;
    audio.begin(slot);
    $('stop').hidden = false;
    text(
      'source-state',
      showcase ? 'SYNTHETIC · ' + SAMPLER_LABELS[slot] : 'SYNTHETIC · programmed example',
    );
    text(
      'montage-name',
      showcase
        ? '19 electrodes · average reference · synthetic'
        : 'Longitudinal bipolar · synthetic',
    );
    const generate = showcase ? showcaseBlock : patientDemoBlock;
    const p = new FeaturePipeline(receive),
      s = { hp: 0.5, lp: 45, notch: 'off' };
    let t = 0;
    preloading = true;
    for (; t < Math.min(preload, duration); t += 0.5) {
      p.ingest(
        {
          start: t,
          duration: 0.5,
          rate: 128,
          channels: generate(t, 0.5, 128, { slot, changes, seed }),
        },
        { settings: s, segment: 'demo', source: 'demo' },
      );
      if (showcase && t + 0.5 === 6) baselineMap.pin(lastFrame);
      if (t % 4 === 0) {
        status('Building synthetic history · ' + Math.round((100 * t) / preload) + '%');
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (token !== operation) return;
      }
    }
    preloading = false;
    render();
    if (t >= duration) {
      stop();
      root.querySelector('[data-view="side"]').click();
      status('Complete synthetic history · drag to rotate; scroll to zoom.');
      return;
    }
    timer = setInterval(() => {
      if (!active) return;
      if (t >= duration) {
        stop();
        return;
      }
      p.ingest(
        {
          start: t,
          duration: 0.5,
          rate: 128,
          channels: generate(t, 0.5, 128, { slot, changes, seed }),
        },
        { settings: s, segment: 'demo', source: 'demo' },
      );
      t += 0.5;
      // The demonstrator's known quiet interval is explicit. Real capture
      // has no automatic baseline selection and requires the operator to pin it.
      if (t === 6) {
        audio.pinBaseline(slot);
        baselineMap.pin(lastFrame);
      }
    }, 500);
    status(
      showcase
        ? '12-minute synthetic sampler · programmed examples, not diagnoses.'
        : 'Synthetic sound example · 1:24.',
    );
  }
  async function refreshSessions() {
    if (!storageReady) return;
    const list = await archive.sessions();
    $('sessions').replaceChildren(
      new Option('Select a session', ''),
      ...list.map((s) => new Option(`${new Date(s.created).toLocaleString()} · ${s.source}`, s.id)),
    );
  }
  async function restore() {
    const id = $('sessions').value;
    if (!id) return;
    stop();
    newHistory('saved', false);
    localId = null;
    const token = ++restoreToken;
    text('storage-state', 'Opening local history…');
    await persistQueue;
    if (token !== restoreToken) return;
    await archive.visit(id, (f) => {
      if (token !== restoreToken) return;
      history.add(f);
      captureCoverage.ingest(f);
      lastFrame = f;
    });
    if (token !== restoreToken) return;
    localId = id;
    source = lastFrame?.source || 'saved';
    text('source-state', 'Saved quantitative history');
    render();
    text('storage-state', 'Local history opened. Capture is stopped.');
  }
  let detailTimer;
  function selectTime() {
    if (paused) return;
    $('follow').checked = false;
    historyDetail = null;
    render();
    clearTimeout(detailTimer);
    const id = localId,
      focus = Number($('time').value);
    if (!id) return;
    detailTimer = setTimeout(async () => {
      try {
        const frames = await archive.frames(id, Math.max(0, focus - 10), focus + 10);
        if (localId === id && Number($('time').value) === focus) {
          historyDetail = frames;
          render();
        }
      } catch {
        text(
          'storage-state',
          'Detailed local frames could not be read. Showing the memory summary.',
        );
      }
    }, 180);
  }
  root.querySelectorAll('[data-view]').forEach(
    (b) =>
      (b.onclick = () => {
        mode = b.dataset.view;
        historyDetail = null;
        root
          .querySelectorAll('[data-view]')
          .forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        if (mode === 'recent') {
          if ($('surface-mode').value === 'spectrum') $('surface-mode').value = 'fluid';
          $('color-mode').value = 'frequency';
        }
        if (mode === 'side' || mode === 'recent') ensureField().side();
        else ensureField().home();
        render();
      }),
  );
  for (const [i, b] of BANDS.entries()) {
    const el = document.createElement('button'),
      dot = document.createElement('i');
    dot.style.background = b.color;
    el.append(dot, `${b.short} ${b.lo}–${b.hi} Hz`);
    el.dataset.band = String(i);
    el.setAttribute('aria-pressed', 'false');
    $('bands').append(el);
  }
  root.querySelectorAll('[data-band]').forEach(
    (b) =>
      (b.onclick = () => {
        band = Number(b.dataset.band);
        root
          .querySelectorAll('[data-band]')
          .forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        render();
      }),
  );
  $('capture').onclick = launchCapture;
  $('demo').onclick = async () => {
    try {
      await audio.enable();
      await demo({ showcase: true, duration: SHOWCASE_LENGTH, preload: 2 });
    } catch {
      status('The demo could not start. Check sound permission and retry.', true);
    }
  };
  $('stop').onclick = stop;
  $('guide').onclick = () => $('help').showModal();
  $('color-mode').onchange = () => {
    if (mode === 'recent' && $('color-mode').value !== 'frequency')
      root.querySelector('[data-view="side"]').click();
    else render();
  };
  $('surface-mode').onchange = render;
  $('pattern-kind').onchange = render;
  $('color-off').onchange = render;
  $('panel-details').onclick = () => {
    const open = root.classList.toggle('controls-open');
    $('panel-details').setAttribute('aria-expanded', String(open));
  };
  $('home').onclick = () => ensureField().home();
  $('fly').onchange = () => ensureField().enter($('fly').checked);
  $('fov').oninput = () => {
    ensureField().lens($('fov').value);
    text('fov-value', $('fov').value + '°');
  };
  for (const id of ['cut', 'time-lens', 'statistic', 'occupancy-threshold']) $(id).oninput = render;
  $('scale').oninput = () => {
    text('scale-value', $('scale').value + ' µV');
    render();
  };
  $('channel').onchange = () => {
    selected = $('channel').value;
    render();
  };
  $('time').oninput = selectTime;
  $('follow').onchange = () => {
    historyDetail = null;
    render();
  };
  $('pause').onclick = () => {
    if (!paused) {
      frozenFrame = visibleFrame();
      frozenFrames = history.overview(16);
      frozenRecent = recentWaveforms(historyDetail || history.bins(), Number($('time').value));
      frozenEnd = history.end;
    }
    paused = !paused;
    text('pause', paused ? 'Resume view' : 'Freeze view');
    $('pause').setAttribute('aria-pressed', String(paused));
    render();
  };
  $('setup-again').onclick = () => {
    suspend('Reviewing capture setup.');
    $('confirmed').checked = false;
    $('setup').showModal();
    drawPreview();
  };
  $('filters-quick').onclick = () => {
    if (!capture.stream || !confirmedDisplay) return;
    if (!active && !filterOnlyEligible) {
      status(
        'The layout, timebase or calibration needs full review. Choose Review capture setup.',
        true,
      );
      return;
    }
    markUncertain();
    suspend('Filter review: this patient is paused; other patients continue.', true);
    const proposed = lastDetected || settings();
    for (const k of ['hp', 'lp']) $('quick-' + k).value = proposed[k] ?? '';
    $('quick-notch').value = ['off', '50', '60'].includes(proposed.notch)
      ? proposed.notch
      : 'unknown';
    $('quick-confirm').checked = false;
    text(
      'quick-status',
      'Only filters changed. If timebase, sensitivity, montage or layout also changed, use full setup.',
    );
    $('quick-filters').showModal();
  };
  $('quick-apply').onclick = async () => {
    const s = {
      hp: number('quick-hp'),
      lp: number('quick-lp'),
      notch: $('quick-notch').value === 'unknown' ? null : $('quick-notch').value,
    };
    if (
      !$('quick-confirm').checked ||
      !validFilters(s) ||
      !capture.stream ||
      capture.dimensions().join() !== dimensions.join()
    ) {
      text(
        'quick-status',
        'Confirm unchanged geometry and valid filter values. Resized windows require full setup.',
      );
      return;
    }
    for (const k of ['hp', 'lp']) $(k).value = s[k] ?? '';
    $('notch').value = s.notch ?? 'unknown';
    if (lastDetected)
      for (const k of ['hp', 'lp', 'notch']) if (lastDetected[k] != null) lastDetected[k] = s[k];
    $('confirmed').checked = true;
    await begin();
    if (active) $('quick-filters').close();
    else text('quick-status', 'Capture could not resume. Use full setup to review the source.');
  };
  $('quick-full').onclick = () => {
    $('quick-filters').close();
    $('setup-again').click();
  };
  $('quick-cancel').onclick = () => {
    $('quick-filters').close();
    status('This patient remains paused pending settings review.');
  };
  $('recognize').onclick = readLabels;
  $('check-rows').onclick = checkRows;
  $('begin').onclick = async () => {
    if (starting) return;
    starting = true;
    const token = operation;
    $('begin').disabled = true;
    $('begin').textContent = 'Starting…';
    text('setup-status', 'Checking channel positions and waveforms…');
    try {
      await startCaptureWithSound({
        enableSound: () => audio.enable(),
        startCapture: begin,
        soundState: (state) => {
          if (token !== operation) return;
          $('capture-sound').hidden = state === 'ready';
          $('capture-sound').textContent =
            state === 'ready'
              ? ''
              : 'Sound is not enabled. Capture can continue; use Enable sound to retry.';
        },
      });
    } catch (e) {
      text('setup-status', e.message || 'Capture could not start. Check the selected area.', true);
    } finally {
      if (token === operation) {
        starting = false;
        $('begin').disabled = false;
        $('begin').textContent = 'Start capture + sound';
      }
    }
  };
  $('cancel-setup').onclick = () => {
    $('setup').close();
    stop();
  };
  $('calibrate').onclick = () => {
    calibration = [];
    text('setup-status', 'Click the two vertical endpoints of the voltage calibration bar.');
  };
  $('setup').addEventListener('cancel', () => {
    if (!active) stop();
  });
  $('setup').addEventListener('close', () => {
    $('setup-preview').width = 0;
    if (!active && capture.stream) stop();
  });
  $('save-local').onchange = () => {
    if ($('save-local').checked) beginSave();
    else {
      localId = null;
      text('storage-state', 'New history is memory-only. Existing saved sessions are retained.');
    }
  };
  $('restore').onclick = () =>
    restore().catch(() => text('storage-state', 'This local session could not be opened.'));
  $('erase').onclick = async () => {
    const id = $('sessions').value;
    if (!id) return;
    if (!confirm('Delete this quantitative session from this browser?')) return;
    await archive.erase(id);
    if (localId === id) {
      localId = null;
      $('save-local').checked = false;
    }
    await refreshSessions();
    text('storage-state', 'Selected session deleted.');
  };
  archive
    .open()
    .then(() => {
      storageReady = true;
      refreshSessions();
    })
    .catch(() =>
      text(
        'storage-state',
        'Persistent browser storage is unavailable. Memory history still works.',
      ),
    );
  window.addEventListener('beforeunload', () => {
    clearInterval(previewTimer);
    capture.stop();
    audio.stop(slot);
    worker?.terminate();
  });

  return {
    demo,
    stop,
    refreshCoverage: renderCoverage,
    time: () => history.end,
    hasCapture: () => Boolean(capture.stream),
    pinBaseline: () => {
      const reference = baselineWindow.reference(lastFrame);
      if (!reference || !audio.pinBaseline(slot, reference)) return false;
      const ok = baselineMap.pin(reference);
      render();
      return ok;
    },
    demoLabel: () => (demoKind === 'showcase' ? showcasePhase(history.end, slot) : null),
    setVisible(value) {
      visible = value;
      root.hidden = !value;
      if (field) field.visible = value && visualsEnabled;
      if (value) {
        field?.resize();
        render();
      }
    },
    setVisuals(value) {
      visualsEnabled = value;
      if (field) field.visible = visible && value;
      root.querySelector('[data-id="stage"]').hidden = !value;
      if (value) render();
    },
    lock(value) {
      for (const id of ['capture', 'demo', 'restore', 'setup-again', 'filters-quick'])
        $(id).disabled = value;
    },
  };
}
