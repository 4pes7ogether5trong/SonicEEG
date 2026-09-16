export const BANDS = [
  { name: 'Delta', short: 'δ', lo: 0.5, hi: 4, color: '#a28cff' },
  { name: 'Theta', short: 'θ', lo: 4, hi: 8, color: '#56bcec' },
  { name: 'Alpha', short: 'α', lo: 8, hi: 13, color: '#5ce0b0' },
  { name: 'Beta', short: 'β', lo: 13, hi: 30, color: '#efb864' },
  { name: '30–45 Hz', short: 'γ', lo: 30, hi: 45, color: '#e78dce' },
];
export const AMPLITUDE_THRESHOLDS = [5, 10, 20, 40, 80, 160, 320];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      let wr = 1,
        wi = 0;
      for (let j = 0; j < len / 2; j++) {
        let u = i + j,
          v = u + len / 2,
          tr = re[v] * wr - im[v] * wi,
          ti = re[v] * wi + im[v] * wr;
        re[v] = re[u] - tr;
        im[v] = im[u] - ti;
        re[u] += tr;
        im[u] += ti;
        [wr, wi] = [
          wr * Math.cos(a) - wi * Math.sin(a),
          wr * Math.sin(a) + wi * Math.cos(a),
        ];
      }
    }
  }
}
export function analyze(samples, rate, settings = {}) {
  if (
    samples.length < 8 ||
    !Number.isFinite(rate) ||
    rate <= 0 ||
    Array.from(samples).some((v) => !Number.isFinite(v))
  )
    return { valid: false, bands: BANDS.map(() => null) };
  let n = 1;
  while (n < samples.length) n *= 2;
  const mean = samples.reduce((s, x) => s + x, 0) / samples.length,
    re = new Float64Array(n),
    im = new Float64Array(n);
  let w2 = 0,
    sq = 0,
    min = Infinity,
    max = -Infinity,
    line = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i] - mean,
      w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (samples.length - 1));
    re[i] = v * w;
    w2 += w * w;
    sq += v * v;
    min = Math.min(min, v);
    max = Math.max(max, v);
    if (i) line += Math.abs(samples[i] - samples[i - 1]);
  }
  fft(re, im);
  const df = rate / n,
    powers = new Array(BANDS.length).fill(0);
  let total = 0,
    peak = 0,
    peakF = 0;
  for (let k = 0; k <= n / 2; k++) {
    const f = k * df,
      p =
        ((re[k] ** 2 + im[k] ** 2) / (rate * w2)) *
        (k === 0 || k === n / 2 ? 1 : 2);
    BANDS.forEach((b, i) => {
      if (f >= b.lo && (f < b.hi || (i === 4 && f === 45))) powers[i] += p * df;
    });
    if (f >= 0.5 && f <= Math.min(45, rate / 2)) {
      total += p * df;
      if (p > peak) {
        peak = p;
        peakF = f;
      }
    }
  }
  const affected = BANDS.map(
    (b) =>
      rate / 2 < b.hi ||
      (settings.hp != null && settings.hp >= b.lo) ||
      (settings.lp != null && settings.lp <= b.hi) ||
      (Number(settings.notch) >= b.lo && Number(settings.notch) <= b.hi),
  );
  return {
    valid: true,
    rms: Math.sqrt(sq / samples.length),
    min,
    max,
    last: samples.at(-1) - mean,
    bands: powers,
    total,
    peakHz: peakF,
    affected,
    unknownFilters:
      settings.hp == null || settings.lp == null || settings.notch == null,
    lineLength: line / (samples.length / rate),
    duration: samples.length / rate,
  };
}
export function amplitudeHistogram(bands, duration) {
  return bands.map((p) => ({
    [AMPLITUDE_THRESHOLDS.filter((t) => Math.sqrt(p) >= t).length]: duration,
  }));
}
export function prevalence(channel, band, thresholdIndex) {
  const bins = channel.amplitudeHistogram?.[band];
  if (!bins || !channel.validSeconds) return null;
  return (
    Object.entries(bins).reduce(
      (s, [bin, time]) => s + (Number(bin) > thresholdIndex ? time : 0),
      0,
    ) / channel.validSeconds
  );
}
export function demoBlock(start, duration = 1, rate = 128) {
  const labels = [
    'FP1-F7',
    'F7-T7',
    'T7-P7',
    'P7-O1',
    'FP2-F8',
    'F8-T8',
    'T8-P8',
    'P8-O2',
    'FP1-F3',
    'F3-C3',
    'C3-P3',
    'P3-O1',
    'FP2-F4',
    'F4-C4',
    'C4-P4',
    'P4-O2',
    'FZ-CZ',
    'CZ-PZ',
  ];
  return labels.map((name, c) => ({
    name,
    rate,
    start,
    segment: 'demo',
    status: 'observed',
    valid: true,
    samples: Float32Array.from(
      { length: Math.round(rate * duration) },
      (_, i) => {
        const t = start + i / rate,
          burst = t % 40 > 12 && t % 40 < 22 && c >= 1 && c <= 2;
        return (
          (c % 4 === 3 ? 17 : 7) * Math.sin(2 * Math.PI * 10 * t + c * 0.2) +
          5 * Math.sin(2 * Math.PI * 2 * t + c) +
          2 * Math.sin(2 * Math.PI * 19 * t + c * 0.7) +
          (burst
            ? 27 *
              Math.sin(2 * Math.PI * (5 * (t % 40) + 0.045 * (t % 40) ** 2))
            : 0)
        );
      },
    ),
  }));
}
