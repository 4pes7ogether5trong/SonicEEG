// Measurement contract shared by the browser views and audio mapping.
// Units stay in uV (or explicitly uncalibrated relative units); no age remapping.
export const BANDS = [
  { key: 'delta', symbol: 'δ', low: 0.5, high: 4, color: '#a08bee' },
  { key: 'theta', symbol: 'θ', low: 4, high: 8, color: '#65c2ec' },
  { key: 'alpha', symbol: 'α', low: 8, high: 13, color: '#85e6bc' },
  { key: 'beta', symbol: 'β', low: 13, high: 30, color: '#efb675' },
  { key: 'gamma', symbol: 'γ', low: 30, high: 45, color: '#e888b9' },
];
export const CHANNELS = [
  'Fp1',
  'Fp2',
  'F7',
  'F3',
  'Fz',
  'F4',
  'F8',
  'T7',
  'C3',
  'Cz',
  'C4',
  'T8',
  'P7',
  'P3',
  'Pz',
  'P4',
  'P8',
  'O1',
  'O2',
  'F9',
  'F10',
  'T9',
  'T10',
  'P9',
  'P10',
];
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const bandAt = (f) =>
  BANDS.find((b) => f >= b.low && (f < b.high || (b.high === 45 && f === 45)));
export const frequencyPosition = (f) => Math.log(clamp(f, 0.5, 45) / 0.5) / Math.log(90);
export const powerDb = (p) => 10 * Math.log10(Math.max(1e-12, p));
const positions = {
  FP1: [-0.85, -3.2],
  FP2: [0.85, -3.2],
  F7: [-2.6, -1.8],
  F3: [-1.2, -1.8],
  FZ: [0, -1.8],
  F4: [1.2, -1.8],
  F8: [2.6, -1.8],
  T7: [-3, 0],
  C3: [-1.35, 0],
  CZ: [0, 0],
  C4: [1.35, 0],
  T8: [3, 0],
  P7: [-2.6, 1.8],
  P3: [-1.2, 1.8],
  PZ: [0, 1.8],
  P4: [1.2, 1.8],
  P8: [2.6, 1.8],
  O1: [-0.9, 3.2],
  O2: [0.9, 3.2],
  F9: [-3.8, -2],
  F10: [3.8, -2],
  T9: [-4.2, 0],
  T10: [4.2, 0],
  P9: [-3.8, 2],
  P10: [3.8, 2],
};
export function canonical(name) {
  const clean = String(name)
    .toUpperCase()
    .replace(/^EEG\s*/, '')
    .replace(/[-\s](REF|AVG|LE|RE)$/, '')
    .replace(/\s/g, '');
  return { T3: 'T7', T4: 'T8', T5: 'P7', T6: 'P8' }[clean] || clean;
}
export function location(name) {
  const key = canonical(name),
    pos = positions[key];
  if (pos)
    return {
      x: pos[0],
      z: pos[1],
      hemisphere: pos[0] < 0 ? 'left' : pos[0] > 0 ? 'right' : 'midline',
      region: /^(O|P)/.test(key)
        ? 'posterior'
        : /^T/.test(key)
          ? 'temporal'
          : /^C/.test(key)
            ? 'central'
            : 'frontal',
      known: true,
    };
  const pair = key.split('-');
  if (pair.length === 2 && pair.every((p) => positions[canonical(p)])) {
    const a = location(pair[0]),
      b = location(pair[1]);
    return {
      x: (a.x + b.x) / 2,
      z: (a.z + b.z) / 2,
      hemisphere: a.hemisphere === b.hemisphere ? a.hemisphere : 'midline',
      region: 'bipolar',
      known: true,
    };
  }
  let hash = 2166136261;
  for (const ch of key) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  const a = ((hash >>> 0) / 4294967296) * Math.PI * 2;
  return {
    x: 5 * Math.cos(a),
    z: 4 * Math.sin(a),
    hemisphere: 'unknown',
    region: 'unmapped',
    known: false,
  };
}

export function fft(real, imag) {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len,
      wr0 = Math.cos(angle),
      wi0 = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let wr = 1,
        wi = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j,
          b = a + len / 2,
          vr = real[b] * wr - imag[b] * wi,
          vi = real[b] * wi + imag[b] * wr;
        real[b] = real[a] - vr;
        imag[b] = imag[a] - vi;
        real[a] += vr;
        imag[a] += vi;
        const next = wr * wr0 - wi * wi0;
        wi = wr * wi0 + wi * wr0;
        wr = next;
      }
    }
  }
}

export function analyzeChannel(samples, fs, name, { unit = 'uV', calibrated = true } = {}) {
  const n = samples.length;
  if (n < 8 || !(fs > 0) || !Number.isFinite(fs))
    throw new Error('At least 8 samples and a finite positive sampling rate are required.');
  let count = 0,
    mean = 0,
    min = Infinity,
    max = -Infinity;
  for (const v of samples)
    if (v !== null && Number.isFinite(v)) {
      count++;
      mean += v;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
  mean /= count || 1;
  const nfft = 2 ** Math.ceil(Math.log2(n)),
    re = new Float64Array(nfft),
    im = new Float64Array(nfft);
  let energy = 0,
    squares = 0;
  for (let i = 0; i < n; i++) {
    const v = samples[i] !== null && Number.isFinite(samples[i]) ? samples[i] - mean : 0;
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    re[i] = v * w;
    energy += w * w;
    squares += v * v;
  }
  fft(re, im);
  const frequencies = [],
    density = [],
    absolute = Object.fromEntries(BANDS.map((b) => [b.key, 0]));
  let total = 0,
    weighted = 0,
    peak = -1,
    peakF = 0,
    peakI = 0;
  const df = fs / nfft;
  for (let k = 1; k <= nfft / 2; k++) {
    const f = k * df;
    if (f < 0.5 || f > 45) continue;
    const p = ((re[k] * re[k] + im[k] * im[k]) / (fs * energy)) * (k === nfft / 2 ? 1 : 2);
    frequencies.push(f);
    density.push(p);
    total += p * df;
    weighted += f * p * df;
    const band = bandAt(f);
    if (band) absolute[band.key] += p * df;
    if (p > peak) {
      peak = p;
      peakF = f;
      peakI = k;
    }
  }
  const rms = Math.sqrt(squares / (count || 1)),
    missing = 1 - count / n;
  const flags = [];
  if (missing > 0) flags.push('missing_samples');
  if (rms < 1e-9) flags.push('flatline_candidate');
  if (calibrated && max - min > 1000) flags.push('extreme_amplitude_candidate');
  // A spectrum containing gaps is unavailable, not a spectrum of invented samples.
  const valid = missing === 0 && total > 1e-15;
  const relative = Object.fromEntries(
    BANDS.map((b) => [b.key, valid ? absolute[b.key] / total : 0]),
  );
  let concentration = 0,
    cumulative = 0,
    sef95 = 0,
    entropy = 0;
  if (valid)
    for (let i = 0; i < density.length; i++) {
      const fraction = (density[i] * df) / total;
      if (Math.abs(frequencies[i] - peakF) <= Math.max(0.75, 1.5 * df)) concentration += fraction;
      cumulative += fraction;
      if (!sef95 && cumulative >= 0.95) sef95 = frequencies[i];
      if (fraction > 0) entropy -= fraction * Math.log(fraction);
    }
  const dominant = valid
    ? BANDS.reduce((a, b) => (relative[a.key] > relative[b.key] ? a : b)).key
    : 'none';
  return {
    name,
    ...location(name),
    voltage_unit: unit,
    voltage_calibrated: calibrated,
    dominant_frequency_hz: valid ? peakF : 0,
    dominant_band: dominant,
    spectral_centroid_hz: valid ? weighted / total : 0,
    rms_amplitude: rms,
    peak_to_peak: count ? max - min : 0,
    mean_voltage: mean,
    instantaneous_voltage:
      samples[n - 1] !== null && Number.isFinite(samples[n - 1]) ? samples[n - 1] - mean : null,
    band_powers: relative,
    band_power_absolute: valid ? absolute : Object.fromEntries(BANDS.map((b) => [b.key, 0])),
    spectrum: {
      frequency_hz: frequencies,
      power_density: valid ? density : density.map(() => 0),
      unit: calibrated ? 'uV²/Hz' : 'relative²/Hz',
      valid,
    },
    spectral_edge_95_hz: sef95,
    spectral_entropy: valid && density.length > 1 ? entropy / Math.log(density.length) : 0,
    rhythmicity: concentration,
    phase_rad: valid ? Math.atan2(im[peakI], re[peakI]) : 0,
    quality: missing ? count / n : rms < 1e-9 ? 0 : 1,
    quality_flags: flags,
    trace_samples: Array.from(samples, (v) => (v !== null && Number.isFinite(v) ? v : null)),
    frequency_resolution_hz: 1 / (n / fs),
    fft_bin_width_hz: df,
  };
}

export function frameAt(recording, endSeconds, windowSeconds = 2) {
  const fs = recording.sample_rate_hz,
    size = Math.round(fs * windowSeconds);
  const end = clamp(
    Math.round(endSeconds * fs),
    Math.min(size, recording.data[0].length),
    recording.data[0].length,
  );
  const start = Math.max(0, end - size);
  const channels = recording.channel_names.map((name, i) =>
    analyzeChannel(recording.data[i].subarray(start, end), fs, name, {
      unit: recording.unit,
      calibrated: recording.voltage_calibrated,
    }),
  );
  return {
    schema: 'soniceeg.visual-frame/2',
    frame_id: end,
    source_kind: recording.synthetic ? 'synthetic' : 'raw-file',
    source_label: recording.label,
    recording_id: recording.id,
    reference: recording.reference || 'unspecified',
    timestamp_s: start / fs,
    end_s: end / fs,
    sample_rate_hz: fs,
    window_seconds: (end - start) / fs,
    channels,
    warnings: fs < 90 ? ['Spectrum truncated at the recording Nyquist frequency.'] : [],
    annotations: (recording.events || []).filter(
      (e) => e.onset_s < end / fs && e.onset_s + e.duration_s > start / fs,
    ),
  };
}

export function compareFrames(a, b, name) {
  if (!a || !b) return { valid: false, reason: 'Pin a reference window to compare.' };
  const x = a.channels.find((c) => c.name === name),
    y = b.channels.find((c) => c.name === name);
  if (!x || !y) return { valid: false, reason: 'This channel is absent from one window.' };
  if (!x.voltage_calibrated || !y.voltage_calibrated || x.voltage_unit !== y.voltage_unit)
    return { valid: false, reason: 'Absolute comparison needs the same calibrated voltage units.' };
  if (a.reference !== b.reference)
    return { valid: false, reason: 'References differ; absolute comparison is disabled.' };
  if (
    (!a.reference || a.reference === 'unspecified') &&
    (!a.recording_id || a.recording_id !== b.recording_id)
  )
    return {
      valid: false,
      reason: 'Declare the same reference before comparing different recordings.',
    };
  if (a.sample_rate_hz !== b.sample_rate_hz || Math.abs(a.window_seconds - b.window_seconds) > 1e-6)
    return {
      valid: false,
      reason: 'Match sampling rates and analysis windows for a controlled comparison.',
    };
  if (!x.spectrum?.valid || !y.spectrum?.valid)
    return { valid: false, reason: 'A window contains gaps or no measurable spectral power.' };
  return {
    valid: true,
    rms_delta: y.rms_amplitude - x.rms_amplitude,
    peak_delta: y.dominant_frequency_hz - x.dominant_frequency_hz,
    band_delta_db: Object.fromEntries(
      BANDS.map((band) => {
        const p = x.band_power_absolute[band.key],
          q = y.band_power_absolute[band.key];
        return [band.key, p > 1e-12 && q > 1e-12 ? 10 * Math.log10(q / p) : null];
      }),
    ),
  };
}
