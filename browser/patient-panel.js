import { BANDS, AMPLITUDE_THRESHOLDS, prevalence } from './signal.js';
import { parseDerivation, recognizeMontage } from './montage.js';
import { TemporalHistory, LocalArchive, summarizeFrames } from './history.js';
import { FeaturePipeline } from './pipeline.js';
import { BrowserCapture } from './capture.js';
import { FluidField } from './field.js';
import { patientDemoBlock, DEMO_LENGTH } from './demo.js';
import { extractTraces } from './pixels.js';
import {
  settingsDifference,
  settingsWatchReference,
  validFilters,
} from './display-settings.js';
export function mountPatient(root, audio, slot, onState = () => {}) {
  let visible = false,
    preloading = false,
    field = null,
    visualsEnabled = true;
  const $ = (id) => root.querySelector('[data-id="' + id + '"]'),
    text = (id, value) => {
      $(id).textContent = value;
    };
  const capture = new BrowserCapture(),
    archive = new LocalArchive();
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
    busy = false,
    segment = 0,
    localId = null,
    persistQueue = Promise.resolve(),
    storageReady = false,
    reading = false,
    regions = {},
    roi = 'plot',
    drag = null,
    ocrRows = [],
    ocrLabels = '',
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
    confirmedNames = '',
    frozenFrame = null,
    frozenFrames = null,
    frozenEnd = 0;
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
  const number = (id) =>
    $(id).value.trim() === '' ? null : Number($(id).value);
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
    $('channel').replaceChildren(new Option('All observed channels', ''));
    if (save && $('save-local').checked) return beginSave();
  }
  async function beginSave() {
    if (!storageReady) {
      text(
        'storage-state',
        'Local storage is unavailable. History remains in memory.',
      );
      return;
    }
    const token = sessionToken;
    try {
      const id = await archive.create(
        'Patient ' + 'ABCD'[slot] + ' · ' + source,
      );
      if (token !== sessionToken) return;
      localId = id;
      await refreshSessions();
      text('storage-state', 'Saving new quantitative frames on this device.');
    } catch {
      localId = null;
      text(
        'storage-state',
        'Could not create a local session. History remains in memory.',
      );
    }
  }
  function receive(frame) {
    if (frame.start < history.end - 1e-5) {
      status('An overlapping interval was rejected.', true);
      return;
    }
    // Every accepted interval carries its capture context. No screenshot bytes are retained.
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
  function visibleFrame() {
    if (paused && frozenFrame) return frozenFrame;
    return $('follow').checked
      ? lastFrame
      : historyDetail?.find(
          (f) =>
            f.start <= Number($('time').value) &&
            f.end > Number($('time').value),
        ) || history.select(Number($('time').value));
  }
  function render() {
    if (!visible || !visualsEnabled) return;
    const field = ensureField();
    const f = visibleFrame();
    if (!f) return;
    const shownEnd = paused ? frozenEnd : history.end;
    $('empty').hidden = true;
    $('time').max = String(shownEnd);
    if ($('follow').checked) $('time').value = String(shownEnd);
    const focus = Number($('time').value),
      frames =
        mode === 'live'
          ? [f]
          : paused
            ? frozenFrames
            : historyDetail
              ? summarizeFrames(historyDetail)
              : history.overview(16),
      threshold =
        $('statistic').value === 'prevalence'
          ? Number($('occupancy-threshold').value)
          : -1;
    $('occupancy-threshold').disabled = threshold < 0;
    $('scale').disabled = threshold >= 0;
    field.update(frames, {
      mode,
      band,
      selected,
      scale: Number($('scale').value),
      lens: Number($('time-lens').value),
      focus,
      total: shownEnd,
      cut: Number($('cut').value) >= 4 ? 20 : Number($('cut').value),
      peaks: $('statistic').value === 'peaks',
      threshold,
    });
    text('clock', format(focus));
    text('elapsed', format(history.end));
    text(
      'resolution',
      `${format(f.start)}–${format(f.end)} · ${f.leaves > 1 ? 'compressed summary' : 'quantitative frame'}${f.gaps ? ' · capture gap' : ''}`,
    );
    text(
      'view-label',
      `${source === 'demo' ? 'SYNTHETIC EXAMPLE · ' : ''}${mode === 'side' ? 'Older time extends along the horizontal axis' : mode === 'history' ? 'Near the head = recent · outward = older' : 'Signed surface · two-second spectrum'} · ${f.mixed ? 'mixed recording settings' : 'sensor-space interpolation'}${field.software ? ' · software: one band at a time' : ''}`,
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
    if (c) {
      text(
        'channel-metrics',
        `${selected || 'Largest RMS: ' + c.name} · ${c.valid ? c.rms.toFixed(1) + ' µV RMS' : 'unavailable'}`,
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
        li.textContent = `${c.name} · ${c.status === 'expected' ? 'expected, not visible' : c.valid ? c.status : 'unavailable'}${c.from ? ' via ' + c.from.join(', ') : ''}`;
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
    operation++;
    restoreToken++;
    active = false;
    clearInterval(timer);
    timer = null;
    worker?.terminate();
    worker = null;
    busy = false;
    reading = false;
    capture.stop();
    $('setup-preview').width = 0;
    $('recognize').disabled = false;
    $('begin').disabled = false;
    audio.stop(slot);
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
      ocrRows = [];
      ocrLabels = '';
      lastDetected = null;
      $('labels').value = '';
      for (const id of ['hp', 'lp']) $(id).value = '';
      $('notch').value = 'unknown';
      $('confirmed').checked = false;
      dimensions = capture.dimensions();
      $('setup').showModal();
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
    const ctx = c.getContext('2d');
    ctx.drawImage(v, 0, 0, c.width, c.height);
    for (const [name, r] of Object.entries(regions)) {
      ctx.strokeStyle = {
        plot: '#69e0c2',
        labels: '#8ec8ff',
        settings: '#f3bb75',
      }[name];
      ctx.lineWidth = 2;
      ctx.strokeRect(
        r.x * c.width,
        r.y * c.height,
        r.w * c.width,
        r.h * c.height,
      );
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
            ctx.fillRect(
              r.x * c.width + x * sx,
              r.y * c.height + row.pixelY[x] * sy,
              2,
              2,
            );
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
        const pixels =
          Math.abs(calibration[1].y - calibration[0].y) *
          capture.video.videoHeight;
        if (pixels < 4) {
          text(
            'setup-status',
            'Calibration marks are too close together. Try again.',
          );
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
  $('setup-preview').addEventListener('pointerup', (e) => {
    if (!drag) return;
    const p = point(e);
    const r = {
      x: Math.min(p.x, drag.x),
      y: Math.min(p.y, drag.y),
      w: Math.abs(p.x - drag.x),
      h: Math.abs(p.y - drag.y),
    };
    drag = null;
    if (r.w > 0.005 && r.h > 0.005) {
      regions[roi] = r;
      $('confirmed').checked = false;
      drawPreview();
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
    if (!regions.plot) throw new Error('Select the waveform region first.');
    const labels = $('labels')
        .value.split(/\n/)
        .map((s) => s.trim())
        .filter(Boolean),
      parsed = labels.map(parseDerivation);
    if (!labels.length || parsed.some((p) => !p))
      throw new Error(
        'Each row needs a recognized electrode pair or explicit reference, such as F7-T7 or C3-REF.',
      );
    if (new Set(parsed.map((p) => p.name)).size !== parsed.length)
      throw new Error(
        'Duplicate derivations need separate handling; remove duplicate rows from the selected region.',
      );
    const height = Math.round(regions.plot.h * capture.video.videoHeight),
      offset = Number($('row-offset').value) || 0;
    const useOCR =
      ocrLabels === $('labels').value && ocrRows.length === parsed.length;
    return parsed.map((p, i) => ({
      name: p.name,
      y:
        (useOCR
          ? (regions.labels.y +
              ocrRows[i].y * regions.labels.h -
              regions.plot.y) /
            regions.plot.h
          : (i + 0.5) / parsed.length) *
          height +
        offset,
    }));
  }
  async function readLabels() {
    if (!regions.labels || !regions.plot) {
      text('setup-status', 'Select waveform and label regions first.');
      return;
    }
    const version = capture.version;
    $('recognize').disabled = true;
    $('begin').disabled = true;
    text('setup-status', 'Reading selected regions with the local OCR model…');
    try {
      const result = await capture.recognize(regions.labels, regions.settings);
      if (version !== capture.version) return;
      ocrRows = result.rows;
      ocrLabels = ocrRows.map((r) => r.name).join('\n');
      $('labels').value = ocrLabels;
      lastDetected = result.settings;
      const s = result.settings;
      if (s) {
        if (s.seconds) $('seconds').value = s.seconds;
        for (const k of ['hp', 'lp']) if (s[k] != null) $(k).value = s[k];
        if (['off', '50', '60'].includes(s.notch)) $('notch').value = s.notch;
      }
      const match = recognizeMontage(ocrRows.map((r) => r.name)),
        repaired = ocrRows.filter((r) => r.corrected).length;
      text(
        'setup-status',
        `${ocrRows.length} rows found · ${match.name}. ${match.missing.length} expected derivations not visible. ${repaired ? `${repaired} labels include OCR correction suggestions. ` : ''}Confirm every label and row alignment.${s?.sensitivity ? ' Printed sensitivity detected; pixel calibration is still required.' : ''}`,
      );
    } catch (e) {
      if (version === capture.version) text('setup-status', e.message);
    } finally {
      if (version === capture.version) {
        $('recognize').disabled = false;
        $('begin').disabled = false;
      }
    }
  }
  async function checkRows() {
    try {
      const rows = getRows(),
        c = capture.crop(regions.plot),
        ctx = c.getContext('2d', { willReadFrequently: true }),
        result = extractTraces(
          ctx.getImageData(0, 0, c.width, c.height),
          rows,
          {
            uvPerPixel: Number($('uv').value),
            negativeUp: $('polarity').value === 'up',
          },
        );
      drawPreview({ width: c.width, height: c.height, rows: result });
      text(
        'setup-status',
        `Orange points show the extracted path. ${result.filter((c) => c.valid).length}/${result.length} rows pass the initial extraction check. Adjust region or baseline offset if needed.`,
      );
      c.width = 0;
      c.height = 0;
    } catch (e) {
      text('setup-status', e.message);
    }
  }
  async function begin() {
    const token = operation,
      version = capture.version;
    try {
      if (!capture.stream) throw new Error('Select a source window again.');
      if (!$('confirmed').checked)
        throw new Error(
          'Confirm the rows, polarity, time and voltage scales before starting.',
        );
      const rows = getRows(),
        seconds = Number($('seconds').value),
        uvPerPixel = Number($('uv').value),
        s = settings();
      if (
        !(seconds > 0 && seconds <= 120 && uvPerPixel > 0 && uvPerPixel <= 100)
      )
        throw new Error('Provide valid time and voltage scales.');
      if (s.hp != null && s.lp != null && s.hp >= s.lp)
        throw new Error(
          'The high-pass cutoff must be below the low-pass cutoff.',
        );
      const h = Math.round(regions.plot.h * capture.video.videoHeight);
      if (rows.some((r) => r.y < 0 || r.y >= h))
        throw new Error(
          'Some label rows fall outside the waveform crop. Adjust the regions.',
        );
      const match = recognizeMontage(rows.map((r) => r.name));
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
      confirmedNames = rows.map((r) => r.name).join('|');
      confirmedDisplay = {
        ...s,
        seconds: lastDetected?.seconds ?? null,
        sensitivity: lastDetected?.sensitivity ?? null,
      };
      watchedDisplay = settingsWatchReference(confirmedDisplay, lastDetected);
      text(
        'settings-watch',
        Object.keys(watchedDisplay).length
          ? 'Automatic check: ' +
              Object.keys(watchedDisplay).join(', ') +
              '. Other settings require manual confirmation.'
          : 'Settings are confirmed manually. Use Filters changed or full setup whenever the source display changes.',
      );
      filterOnlyEligible = true;
      active = true;
      audio.begin(slot);
      segment++;
      dimensions = capture.dimensions();
      historyDetail = null;
      $('setup').close();
      $('stop').hidden = false;
      $('setup-again').hidden = false;
      $('filters-quick').hidden = false;
      text('source-state', 'Local window capture');
      text(
        'montage-name',
        `${match.name} · ${rows.length} visible derivations`,
      );
      worker?.terminate();
      worker = new Worker(new URL('./signal-worker.js', import.meta.url), {
        type: 'module',
      });
      busy = true;
      worker.onmessage = ({ data: m }) => {
        if (token !== operation || !active) return;
        if (m.type === 'frame') receive(m.frame);
        if (m.type === 'status') {
          busy = false;
          status(m.reason);
          if (m.gap) audio.unavailable(slot);
        }
        if (m.type === 'ready') busy = false;
        if (m.type === 'error') {
          busy = false;
          suspend(m.message);
        }
      };
      worker.onerror = () =>
        suspend(
          'The local processing worker stopped. Review capture setup to restart.',
        );
      worker.postMessage({
        type: 'configure',
        offset: history.end,
        config: {
          rows,
          seconds,
          uvPerPixel,
          mode: $('progression').value,
          negativeUp: $('polarity').value === 'up',
          settings: s,
          segment: String(segment),
          expected: match.expected,
        },
      });
      watchAt = performance.now();
      clearInterval(timer);
      timer = setInterval(captureTick, 500);
    } catch (e) {
      text('setup-status', e.message);
    }
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
    busy = false;
    audio.stop(slot, 'review');
    text('source-state', 'Capture needs review');
    status(reason, true);
    $('setup-again').hidden = false;
  }
  function markUncertain() {
    const start = Math.max(0, history.end - 5);
    history.invalidateSince(start);
    if (localId) {
      const id = localId;
      persistQueue = persistQueue
        .then(() => archive.invalidateSince(id, start))
        .catch(() =>
          text(
            'storage-state',
            'Could not update uncertainty in saved history.',
          ),
        );
    }
    render();
  }
  async function captureTick() {
    if (!active || busy || !worker) return;
    const token = operation,
      version = capture.version;
    if (capture.dimensions().join() !== dimensions.join()) {
      suspend(
        'The captured window changed size. Confirm the regions and calibration again.',
      );
      return;
    }
    if (reading) return;
    if (
      performance.now() - watchAt > 5000 &&
      (regions.settings || regions.labels)
    ) {
      reading = true;
      watchAt = performance.now();
      try {
        const checked = regions.labels
            ? await capture.recognize(regions.labels, regions.settings)
            : {
                rows: null,
                settings: await capture.settings(regions.settings),
              },
          next = checked.settings;
        if (token !== operation || version !== capture.version || !active)
          return;
        const difference = regions.settings
          ? settingsDifference(watchedDisplay, next)
          : { needsReview: false, changed: [], unreadable: [] };
        const layoutChanged =
          checked.rows &&
          checked.rows.map((r) => r.name).join('|') !== confirmedNames;
        if (difference.needsReview || layoutChanged) {
          markUncertain();
          suspend(
            'Display settings changed or became unreadable. Recent frames are uncertain; confirm the display before resuming.',
            !layoutChanged &&
              difference.unreadable.length === 0 &&
              difference.changed.every((k) =>
                ['hp', 'lp', 'notch'].includes(k),
              ),
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
    }
    if (!active || !worker) return;
    try {
      const c = capture.crop(regions.plot),
        image = c
          .getContext('2d', { willReadFrequently: true })
          .getImageData(0, 0, c.width, c.height);
      busy = true;
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
      suspend(
        'The captured window is unavailable. Re-select the source window.',
      );
    }
  }
  async function demo({
    preload = 0,
    changes = null,
    seed = 1,
    duration = DEMO_LENGTH,
  } = {}) {
    stop();
    const token = operation;
    await newHistory('demo');
    if (token !== operation) return;
    active = true;
    audio.begin(slot);
    $('stop').hidden = false;
    text('source-state', 'SYNTHETIC · programmed example');
    text('montage-name', 'Longitudinal bipolar · synthetic');
    const p = new FeaturePipeline(receive),
      s = { hp: 0.5, lp: 45, notch: 'off' };
    let t = 0;
    preloading = true;
    for (; t < preload; t += 0.5)
      p.ingest(
        {
          start: t,
          duration: 0.5,
          rate: 128,
          channels: patientDemoBlock(t, 0.5, 128, { slot, changes, seed }),
        },
        { settings: s, segment: 'demo', source: 'demo' },
      );
    preloading = false;
    render();
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
          channels: patientDemoBlock(t, 0.5, 128, { slot, changes, seed }),
        },
        { settings: s, segment: 'demo', source: 'demo' },
      );
      t += 0.5;
      // The demonstrator's known quiet interval is explicit. Real capture
      // has no automatic baseline selection and requires the operator to pin it.
      if (t === 6) audio.pinBaseline(slot);
    }, 500);
    status(
      'Synthetic morphology demonstration. Script labels describe programmed signals, not detected diagnoses.',
    );
  }
  async function refreshSessions() {
    if (!storageReady) return;
    const list = await archive.sessions();
    $('sessions').replaceChildren(
      new Option('Select a session', ''),
      ...list.map(
        (s) =>
          new Option(
            `${new Date(s.created).toLocaleString()} · ${s.source}`,
            s.id,
          ),
      ),
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
        const frames = await archive.frames(
          id,
          Math.max(0, focus - 10),
          focus + 10,
        );
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
        if (mode === 'side') ensureField().side();
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
  $('demo').onclick = () => demo();
  $('stop').onclick = stop;
  $('guide').onclick = () => $('help').showModal();
  $('home').onclick = () => ensureField().home();
  $('fly').onchange = () => ensureField().enter($('fly').checked);
  $('fov').oninput = () => {
    ensureField().lens($('fov').value);
    text('fov-value', $('fov').value + '°');
  };
  for (const id of ['cut', 'time-lens', 'statistic', 'occupancy-threshold'])
    $(id).oninput = render;
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
      frozenEnd = history.end;
    }
    paused = !paused;
    text('pause', paused ? 'Resume view' : 'Freeze view');
    $('pause').setAttribute('aria-pressed', String(paused));
    if (!paused) render();
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
    suspend(
      'Filter review: this patient is paused; other patients continue.',
      true,
    );
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
      notch:
        $('quick-notch').value === 'unknown' ? null : $('quick-notch').value,
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
      for (const k of ['hp', 'lp', 'notch'])
        if (lastDetected[k] != null) lastDetected[k] = s[k];
    $('confirmed').checked = true;
    await begin();
    if (active) $('quick-filters').close();
    else
      text(
        'quick-status',
        'Capture could not resume. Use full setup to review the source.',
      );
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
    // Resume in the click gesture, before history/storage awaits lose activation.
    try {
      await audio.enable();
    } catch {
      text('setup-status', 'Sound could not start. Check browser sound permission, then retry.');
      return;
    }
    await begin();
  };
  $('cancel-setup').onclick = () => {
    $('setup').close();
    stop();
  };
  $('calibrate').onclick = () => {
    calibration = [];
    text(
      'setup-status',
      'Click the two vertical endpoints of the voltage calibration bar.',
    );
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
      text(
        'storage-state',
        'New history is memory-only. Existing saved sessions are retained.',
      );
    }
  };
  $('restore').onclick = () =>
    restore().catch(() =>
      text('storage-state', 'This local session could not be opened.'),
    );
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
    capture.stop();
    audio.stop(slot);
    worker?.terminate();
  });

  return {
    demo,
    stop,
    time: () => history.end,
    hasCapture: () => Boolean(capture.stream),
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
      for (const id of [
        'capture',
        'demo',
        'restore',
        'setup-again',
        'filters-quick',
      ])
        $(id).disabled = value;
    },
  };
}
