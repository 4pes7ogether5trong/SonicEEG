import { CHANNELS, clamp, location } from './analysis.js';
export const DATASETS = [
  {
    id: 'alert',
    label: '01 · Alert / eyes open',
    description: 'Low-amplitude background with occasional frontal blinks.',
  },
  {
    id: 'drowsy',
    label: '02 · Eyes closed / drowsy',
    description:
      'Waxing alpha, slow eye movements, vertex transients and non-evolving temporal theta.',
  },
  {
    id: 'bursts',
    label: '03 · Brief evolving rhythms',
    description: 'Theta–alpha background with three programmed focal evolving bursts.',
  },
];
export function randomGenerator(seed) {
  let x = seed >>> 0;
  return () => {
    x += 0x6d2b79f5;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const TAU = 2 * Math.PI;
const gaussian = (t, mu, sd) => Math.exp(-0.5 * ((t - mu) / sd) ** 2);
function envelope(t, onset, duration, ramp = 0.1) {
  return t < onset || t >= onset + duration
    ? 0
    : Math.min(1, (t - onset) / ramp, (onset + duration - t) / ramp);
}
export function makeRecording(id = 'alert', seed = 1001) {
  const meta = DATASETS.find((x) => x.id === id);
  if (!meta) throw new Error('Unknown demonstration recording.');
  const fs = 512,
    n = fs * 100,
    rng = randomGenerator(seed),
    events = [],
    jitter = seed === 1001 ? 0 : (rng() - 0.5) * 0.4;
  const add = (onset, duration, label, category, extra = {}) =>
    events.push({ onset_s: onset + jitter, duration_s: duration, label, category, ...extra });
  if (id === 'alert') {
    for (const t of [23, 44, 44.55, 66, 83]) add(t, 0.65, 'Frontal blink', 'artifact');
  }
  if (id === 'drowsy') {
    add(34, 3, 'Slow ocular movement', 'artifact');
    add(66.9, 0.8, 'Vertex transient', 'physiology');
    add(74.3, 3.5, 'Non-evolving temporal theta / RMTD-like', 'variant', {
      frequency_start_hz: 6,
      frequency_end_hz: 6,
    });
    add(87.4, 0.8, 'Vertex transient', 'physiology');
  }
  if (id === 'bursts') {
    add(23.1, 2.2, 'Left temporal evolving burst / BIRD-like', 'target', {
      region: 'left-temporal',
      frequency_start_hz: 6,
      frequency_end_hz: 9,
    });
    add(55.2, 4.5, 'Right frontal–central evolving burst / BIRD-like', 'target', {
      region: 'right-frontal-central',
      frequency_start_hz: 7,
      frequency_end_hz: 11,
    });
    add(86.3, 1.5, 'Left temporal fast evolving burst / BIRD-like', 'target', {
      region: 'left-temporal',
      frequency_start_hz: 14,
      frequency_end_hz: 18,
    });
  }
  const sources = Array.from({ length: 7 }, () => new Float64Array(n));
  let colored = 0;
  const phase = rng() * TAU;
  for (let i = 0; i < n; i++) {
    const t = i / fs,
      progress = clamp((t - 35) / 60, 0, 1);
    const alphaAmp =
      id === 'drowsy'
        ? 24 * (1 - 0.9 * progress) * (0.7 + 0.3 * Math.sin(TAU * 0.12 * t) ** 2)
        : id === 'alert'
          ? 5
          : 10;
    sources[0][i] = alphaAmp * Math.sin(TAU * 10 * t + phase);
    sources[1][i] = alphaAmp * 0.6 * Math.sin(TAU * 10.3 * t + phase + 1.7);
    sources[2][i] =
      (id === 'drowsy' ? 3 + 14 * progress : id === 'bursts' ? 9 : 3) *
      Math.sin(TAU * 5.8 * t + phase * 0.5);
    sources[3][i] = 3 * Math.sin(TAU * 18.5 * t + 1.2);
    sources[4][i] = 1.6 * Math.sin(TAU * 1.2 * t + phase);
    colored = 0.93 * colored + (rng() - 0.5) * 2;
    sources[5][i] = colored;
    sources[6][i] = 2 * Math.sin(TAU * 7.1 * t + 2.3);
  }
  const data = CHANNELS.map((name) => {
    const p = location(name),
      out = new Float32Array(n),
      posterior = Math.exp(-(((p.z - 3.2) / 2.3) ** 2)),
      frontal = Math.exp(-(((p.z + 3.2) / 1.7) ** 2));
    const central = Math.exp(-(p.x * p.x + (p.z * 0.9) ** 2) / 2.5);
    let noise = 0;
    for (let i = 0; i < n; i++) {
      const t = i / fs;
      noise = 0.45 * noise + (rng() - 0.5) * 2.2;
      let v =
        sources[0][i] * posterior * (p.x <= 0 ? 1 : 0.55) +
        sources[1][i] * posterior * (p.x >= 0 ? 1 : 0.55) +
        sources[2][i] * (0.65 + 0.25 * Math.exp((-p.x * p.x) / 5)) +
        sources[3][i] * (0.4 + 0.5 * frontal) +
        sources[4][i] +
        sources[5][i] * 0.7 +
        sources[6][i] * 0.45 +
        noise;
      for (const e of events) {
        const u = t - e.onset_s;
        if (u < 0 || u >= e.duration_s) continue;
        if (e.label === 'Frontal blink')
          v += frontal * (88 * gaussian(u, 0.23, 0.075) - 30 * gaussian(u, 0.42, 0.13));
        else if (e.label === 'Slow ocular movement')
          v +=
            frontal *
            (p.x < 0 ? 1 : -1) *
            25 *
            Math.sin(TAU * 0.65 * u) *
            envelope(t, e.onset_s, e.duration_s, 0.3);
        else if (e.label === 'Vertex transient')
          v += central * (-60 * gaussian(u, 0.3, 0.045) + 24 * gaussian(u, 0.42, 0.11));
        else if (e.category === 'variant')
          v +=
            22 *
            Math.exp(-((p.x + 3) ** 2 + p.z * p.z) / 2.3) *
            Math.sin(TAU * 6 * u) *
            envelope(t, e.onset_s, e.duration_s, 0.2);
        else if (e.category === 'target') {
          const progress = u / e.duration_s,
            center = e.region === 'left-temporal' ? [-3, 0] : [1.25, -1.8 + 1.8 * progress];
          const field = Math.exp(-((p.x - center[0]) ** 2 + (p.z - center[1]) ** 2) / 2.4);
          const cycle =
            e.frequency_start_hz * u +
            (0.5 * (e.frequency_end_hz - e.frequency_start_hz) * u * u) / e.duration_s;
          v +=
            42.5 *
            field *
            (0.75 + 0.25 * Math.sin(Math.PI * progress)) *
            Math.sin(TAU * cycle) *
            envelope(t, e.onset_s, e.duration_s, 0.06);
        }
      }
      out[i] = v;
    }
    return out;
  });
  return {
    schema: 'soniceeg.recording/1',
    id: `${id}-${seed}`,
    kind: id,
    label: meta.label,
    description: meta.description,
    synthetic: true,
    seed,
    generator_version: '0.2.0',
    sample_rate_hz: fs,
    duration_s: 100,
    epoch_seconds: 10,
    epoch_count: 10,
    channel_names: [...CHANNELS],
    unit: 'uV',
    voltage_calibrated: true,
    reference: 'synthetic-common-reference',
    projection: 'Illustrative source mixing; not a biophysical head model',
    events,
    data,
  };
}

export function parseRecording(input) {
  if (!input || !Array.isArray(input.data) || !Array.isArray(input.channel_names))
    throw new Error(
      'JSON needs data (channels × samples), channel_names, sample_rate_hz and unit.',
    );
  const fs = Number(input.sample_rate_hz ?? input.sample_rate),
    names = input.channel_names.map(String),
    n = input.data[0]?.length;
  if (!(fs >= 16 && fs <= 4096) || !Number.isFinite(fs))
    throw new Error('Sampling rate must be 16–4096 Hz.');
  if (
    !names.length ||
    names.length > 256 ||
    new Set(names).size !== names.length ||
    names.some((n) => !n.trim() || n.length > 64)
  )
    throw new Error('Use 1–256 unique channel labels, at most 64 characters each.');
  if (
    input.data.length !== names.length ||
    !(n >= Math.ceil(2 * fs)) ||
    n * names.length > 12_000_000 ||
    input.data.some((a) => !Array.isArray(a) || a.length !== n)
  )
    throw new Error(
      'Channels must have equal length, at least 2 seconds, and at most 12 million total samples.',
    );
  const u = String(input.unit || '')
    .toLowerCase()
    .replace(/[µμ]/g, 'u');
  const scale = { uv: 1, mv: 1000, v: 1000000, relative: 1 }[u];
  if (!scale)
    throw new Error('Specify unit as uV, mV, V, or relative; calibration is never guessed.');
  const data = input.data.map((a) =>
    Float32Array.from(a, (v) => {
      if (v === null) return NaN;
      if (typeof v !== 'number' || !Number.isFinite(v))
        throw new Error('Samples must be finite numbers or null for gaps.');
      const x = v * scale;
      if (!Number.isFinite(Math.fround(x))) throw new Error('Sample magnitude is out of range.');
      return x;
    }),
  );
  return {
    schema: 'soniceeg.recording/1',
    id: 'local-import',
    label: 'Imported recording · local only',
    synthetic: false,
    channel_names: names,
    sample_rate_hz: fs,
    data,
    duration_s: n / fs,
    epoch_seconds: 10,
    epoch_count: Math.ceil(n / fs / 10),
    unit: u === 'relative' ? 'relative' : 'uV',
    voltage_calibrated: u !== 'relative' && input.voltage_calibrated !== false,
    reference: typeof input.reference === 'string' ? input.reference.slice(0, 120) : 'unspecified',
    events: [],
  };
}

export function parseCSV(text, fs, unit) {
  const lines = text.trim().split(/\r?\n/),
    separator = lines[0]?.includes('\t') ? '\t' : ',';
  const header = lines
    .shift()
    .replace(/^\uFEFF/, '')
    .split(separator)
    .map((x) => x.trim());
  if (header.some((x) => x.includes('"')))
    throw new Error('Use plain channel labels without quoted delimiters.');
  const time = /^(time|seconds|timestamp|t)$/i.test(header[0]),
    names = time ? header.slice(1) : header;
  const columns = names.map(() => []);
  let last = null;
  for (const line of lines) {
    const cells = line.split(separator);
    if (cells.length !== header.length) throw new Error('CSV rows must match the channel header.');
    if (time) {
      const now = Number(cells[0]);
      if (
        !Number.isFinite(now) ||
        (last !== null && Math.abs(now - last - 1 / fs) > Math.max(1e-6, 0.01 / fs))
      )
        throw new Error('Time column is irregular or does not match the selected sampling rate.');
      last = now;
    }
    names.forEach((_, i) => {
      const value = cells[i + (time ? 1 : 0)].trim();
      columns[i].push(value === '' ? null : Number(value));
    });
  }
  return parseRecording({ data: columns, channel_names: names, sample_rate_hz: fs, unit });
}
export function serializableRecording(recording) {
  return {
    ...recording,
    data: recording.data.map((a) => Array.from(a, (v) => (Number.isFinite(v) ? v : null))),
  };
}
