import { clamp } from './signal.js';
import { extendTracePaths } from './trace-paths.js';
// This operates only on an explicitly selected waveform crop. No OCR/header pixels.
export function extractTraces(
  image,
  rows,
  { uvPerPixel, negativeUp = true, trackPaths = false, previous = null } = {},
) {
  const { width: w, height: h, data } = image;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < gray.length; i++)
    gray[i] = 0.2126 * data[4 * i] + 0.7152 * data[4 * i + 1] + 0.0722 * data[4 * i + 2];
  const bg = [],
    stride = Math.max(1, Math.floor(gray.length / 1000));
  for (let i = 0; i < gray.length; i += stride) bg.push(gray[i]);
  bg.sort((a, b) => a - b);
  const background = bg[Math.floor(bg.length * 0.5)] || 0,
    dark = background > 128;
  const rules = new Uint8Array(w);
  for (let x = 0; x < w; x++) {
    let ink = 0,
      count = 0;
    for (let y = 0; y < h; y += 3) {
      const p = y * w + x,
        i = p * 4;
      const sat =
        Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
      if ((dark ? background - gray[p] : gray[p] - background) > 25 || sat > 45) ink++;
      count++;
    }
    if (ink / count > 0.7) rules[x] = 1;
  }
  const occluded = rules.slice();
  // Only thin, full-height overlays qualify. A wide erased region is a gap.
  for (let x = 0; x < w; x++)
    if (rules[x]) {
      const from = x;
      while (x < w && rules[x]) x++;
      if (x - from > 6) rules.fill(0, from, x);
    }
  // Color belongs to the displayed trace, not to its inferred anatomy. It can
  // separate overlapping differently colored rows without crossing into a
  // neighboring same-color derivation. Monochrome captures keep narrow lanes.
  const colors = rows.map((row, ri) => {
    const spacing = Math.min(
      row.y - (rows[ri - 1]?.y ?? row.y - 40),
      (rows[ri + 1]?.y ?? row.y + 40) - row.y,
    );
    const bins = Array.from({ length: 6 }, () => ({ count: 0, rgb: [0, 0, 0] }));
    for (
      let y = Math.max(0, Math.floor(row.y - spacing * 0.2));
      y < Math.min(h, row.y + spacing * 0.2);
      y++
    )
      for (let x = 0; x < w; x += 6) {
        if (occluded[x]) continue;
        const p = (y * w + x) * 4,
          r = data[p],
          g = data[p + 1],
          b = data[p + 2];
        const low = Math.min(r, g, b),
          high = Math.max(r, g, b),
          sat = high - low;
        if (sat < 60) continue;
        const rgb = [(r - low) / sat, (g - low) / sat, (b - low) / sat];
        const bin =
          bins[
            (r === high ? 0 : g === high ? 2 : 4) + (rgb[(rgb.indexOf(1) + 1) % 3] > 0.5 ? 1 : 0)
          ];
        bin.count++;
        for (let k = 0; k < 3; k++) bin.rgb[k] += rgb[k];
      }
    const best = bins.reduce((a, b) => (a.count > b.count ? a : b));
    const total = bins.reduce((sum, b) => sum + b.count, 0);
    return best.count >= 20 && best.count > total * 0.55
      ? best.rgb.map((v) => v / best.count)
      : null;
  });
  const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  const traces = rows
    .map((row, ri) => {
      // Unused ECG/auxiliary rows still delimit their neighboring EEG lanes.
      if (row.ignore) return null;
      const color = colors[ri];
      const upper = !ri
        ? 1
        : color && colors[ri - 1] && distance(color, colors[ri - 1]) > 0.7
          ? 0.85
          : 0.46;
      const lower =
        ri === rows.length - 1
          ? 1
          : color && colors[ri + 1] && distance(color, colors[ri + 1]) > 0.7
            ? 0.85
            : 0.46;
      const top = clamp(
        Math.floor(
          row.y - (ri ? row.y - rows[ri - 1].y : rows[1]?.y - row.y || h / rows.length) * upper,
        ),
        0,
        h - 1,
      );
      const bottom = clamp(
        Math.ceil(
          row.y +
            (ri < rows.length - 1
              ? rows[ri + 1].y - row.y
              : row.y - rows[ri - 1]?.y || h / rows.length) *
              lower,
        ),
        top + 1,
        h,
      );
      const rh = bottom - top,
        score = new Float32Array(w * rh),
        counts = new Uint16Array(rh);
      for (let y = 0; y < rh; y++)
        for (let x = 0; x < w; x++) {
          const p = (top + y) * w + x,
            g = gray[p],
            ink = dark ? background - g : g - background;
          const sat =
            Math.max(data[4 * p], data[4 * p + 1], data[4 * p + 2]) -
            Math.min(data[4 * p], data[4 * p + 1], data[4 * p + 2]);
          score[x * rh + y] = Math.max(0, ink - 18) + (sat > 60 ? 40 : 0);
          if (color) {
            const low = Math.min(data[4 * p], data[4 * p + 1], data[4 * p + 2]);
            const high = Math.max(data[4 * p], data[4 * p + 1], data[4 * p + 2]);
            const mismatch =
              sat < 20 ||
              Math.hypot(
                (data[4 * p] - low) / sat - color[0],
                (data[4 * p + 1] - low) / sat - color[1],
                (data[4 * p + 2] - low) / sat - color[2],
              ) > 0.6;
            score[x * rh + y] = mismatch
              ? 0
              : Math.max(0, (dark ? background - low : high - background) - 12) + sat * 0.3;
          }
          if (occluded[x]) score[x * rh + y] = 0;
          if (ink > 45) counts[y]++;
        }
      // Long straight grid rules are weaker evidence than an adjacent varying trace.
      for (let y = 0; y < rh; y++)
        if (counts[y] > 0.92 * w) for (let x = 0; x < w; x++) score[x * rh + y] *= 0.12;
      const back = new Int16Array(w * rh),
        prev = new Float64Array(rh),
        cur = new Float64Array(rh),
        left = new Float64Array(rh),
        leftIndex = new Int16Array(rh),
        right = new Float64Array(rh),
        rightIndex = new Int16Array(rh);
      for (let y = 0; y < rh; y++) prev[y] = score[y] - 0.2 * Math.abs(top + y - row.y);
      for (let x = 1; x < w; x++) {
        // Exact L1 distance transform: no arbitrary slope cap that erases sharp activity.
        for (let y = 0; y < rh; y++) {
          if (!y || prev[y] >= left[y - 1] - 2) {
            left[y] = prev[y];
            leftIndex[y] = y;
          } else {
            left[y] = left[y - 1] - 2;
            leftIndex[y] = leftIndex[y - 1];
          }
        }
        for (let y = rh - 1; y >= 0; y--) {
          if (y === rh - 1 || prev[y] >= right[y + 1] - 2) {
            right[y] = prev[y];
            rightIndex[y] = y;
          } else {
            right[y] = right[y + 1] - 2;
            rightIndex[y] = rightIndex[y + 1];
          }
        }
        for (let y = 0; y < rh; y++) {
          const useLeft = left[y] >= right[y];
          cur[y] = (useLeft ? left[y] : right[y]) + score[x * rh + y];
          back[x * rh + y] = useLeft ? leftIndex[y] : rightIndex[y];
        }
        prev.set(cur);
      }
      let y = 0;
      for (let k = 1; k < rh; k++) if (prev[k] > prev[y]) y = k;
      const samples = new Float32Array(w),
        pixelY = new Float32Array(w),
        observed = new Uint8Array(w),
        clippedPixels = new Uint8Array(w);
      for (let x = w - 1; x >= 0; x--) {
        pixelY[x] = top + y;
        // Matching trace chroma is independent evidence. Browser video color
        // conversion can leave a clearly colored antialiased pixel below the
        // monochrome contrast threshold (for example RGB 255,227,231). Do not
        // label that observed ink as an interpolated gap. Neutral/other-hue
        // pixels still have zero score in the color-conditioned path.
        observed[x] = score[x * rh + y] > (color ? 16 : 32) ? 1 : 0;
        if ((y < 2 || y >= rh - 2) && !occluded[x]) {
          clippedPixels[x] = 1;
          observed[x] = 0;
        }
        samples[x] = (top + y - row.y) * (negativeUp ? 1 : -1) * uvPerPixel;
        y = back[x * rh + y];
      }
      const trace = {
        name: row.name,
        labelInferred: row.labelInferred === true,
        samples,
        pixelY,
        observed,
        clippedPixels,
      };
      repairRasterBreaks(trace, rules);
      return { ...trace, ...traceQuality(trace) };
    })
    .filter(Boolean);
  if (trackPaths) {
    extendTracePaths(image, rows, traces, colors, { background, dark, occluded, previous });
    for (const trace of traces) {
      const row = rows.find((r) => r.name === trace.name);
      for (let x = 0; x < w; x++)
        trace.samples[x] = (trace.pixelY[x] - row.y) * (negativeUp ? 1 : -1) * uvPerPixel;
      // Re-evaluate a thin grid interruption against the newly visible path's
      // endpoints, retaining the same short-gap and reconstruction budgets.
      for (let x = 0; x < w; x++) if (trace.observed[x] === 2) trace.observed[x] = 0;
      repairRasterBreaks(trace, rules);
      Object.assign(trace, traceQuality(trace));
    }
  }
  return traces;
}

function repairRasterBreaks({ samples, pixelY, observed, clippedPixels, identityBlocked }, rules) {
  const w = samples.length;
  for (let x = 1; x < w - 1; x++) {
    if (observed[x] || clippedPixels[x] || identityBlocked?.[x]) continue;
    const start = x;
    while (x < w && !observed[x] && !clippedPixels[x] && !identityBlocked?.[x]) x++;
    const length = x - start;
    const ruleCovered =
      length <= 4 &&
      rules.slice(start, x).some(Boolean) &&
      Array.from({ length }, (_, i) => start + i).every(
        (i) => rules[i] || rules[i - 1] || rules[i + 1],
      );
    if (
      (length > 2 && !ruleCovered) ||
      x >= w ||
      !observed[start - 1] ||
      !observed[x] ||
      Math.abs(pixelY[x] - pixelY[start - 1]) > 4 * (length + 1)
    )
      continue;
    for (let i = start; i < x; i++) {
      const mix = (i - start + 1) / (length + 1);
      pixelY[i] = pixelY[start - 1] * (1 - mix) + pixelY[x] * mix;
      samples[i] = samples[start - 1] * (1 - mix) + samples[x] * mix;
      observed[i] = 2;
    }
  }
}

// Keep one native frame and its paths, never a growing video history. Only
// byte-identical columns can contribute temporal anchors to the next frame.
export class TraceTracker {
  reset() {
    this.previous = null;
    this.wall = null;
    this.key = null;
  }
  extract(image, rows, config, wall) {
    const key = JSON.stringify([
      image.width,
      image.height,
      rows,
      config.uvPerPixel,
      config.negativeUp,
    ]);
    if (key !== this.key || !(wall > this.wall) || wall - this.wall > 3) this.reset();
    const traces = extractTraces(image, rows, {
      ...config,
      trackPaths: true,
      previous: config.mode === 'scroll' ? null : this.previous,
    });
    this.previous = { image, traces };
    this.wall = wall;
    this.key = key;
    return traces;
  }
}

function traceQuality({ samples, observed, clippedPixels }) {
  const n = samples.length;
  let good = 0,
    clipped = 0,
    reconstructed = 0;
  for (let i = 0; i < n; i++) {
    if (observed[i]) good++;
    if (observed[i] === 2) reconstructed++;
    if (clippedPixels[i]) clipped++;
  }
  return {
    quality: n ? good / n : 0,
    clipped: n ? clipped / n : 0,
    reconstructed: n ? reconstructed / n : 0,
    valid: n > 0 && good / n > 0.85 && clipped / n < 0.025 && reconstructed / n < 0.05,
  };
}

// A swept page contains both old and new EEG. Old clipping must not invalidate
// a readable new section, and a readable old section must not conceal new loss.
export function traceSection(channel, from, to) {
  const section = {
    ...channel,
    samples: channel.samples.slice(from, to),
    observed: channel.observed?.slice(from, to),
    identityBlocked: channel.identityBlocked?.slice(from, to),
  };
  if (channel.clippedPixels) {
    section.clippedPixels = channel.clippedPixels.slice(from, to);
    section.pixelY = channel.pixelY?.slice(from, to);
    Object.assign(section, traceQuality(section));
  }
  return section;
}
export function readableSections(channels, width) {
  const size = Math.max(16, Math.round(width));
  return channels.filter((channel) => {
    for (let from = 0; from < channel.samples.length; from += Math.max(1, Math.floor(size / 2))) {
      const to = Math.min(channel.samples.length, from + size);
      if (
        to - from >= Math.min(size, channel.samples.length) &&
        traceSection(channel, from, to).valid
      )
        return true;
    }
    return false;
  }).length;
}
function sweepCandidates(image) {
  const { width: w, height: h, data } = image;
  let best = -1,
    bestScore = 0,
    yellow = -1,
    yellowScore = 0;
  for (let x = 1; x < w - 1; x++) {
    let count = 0,
      yellowCount = 0;
    for (let y = 0; y < h; y += 3) {
      const i = (y * w + x) * 4,
        sat =
          Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
      if (sat > 95) count++;
      const r = data[i],
        g = data[i + 1],
        b = data[i + 2];
      if (Math.min(r, g) > Math.max(70, b + 40) && Math.abs(r - g) < 100) yellowCount++;
    }
    const score = count / Math.ceil(h / 3);
    if (score > bestScore) {
      bestScore = score;
      best = x;
    }
    const ys = yellowCount / Math.ceil(h / 3);
    if (ys > yellowScore) {
      yellowScore = ys;
      yellow = x;
    }
  }
  return { yellow: yellowScore > 0.7 ? yellow : null, other: bestScore > 0.7 ? best : null };
}
export function findSweepCursor(image) {
  const candidates = sweepCandidates(image);
  return candidates.yellow ?? candidates.other;
}
export class SweepCursor {
  constructor() {
    this.yellow = false;
  }
  find(image) {
    const candidates = sweepCandidates(image);
    if (candidates.yellow != null) this.yellow = true;
    // A learned yellow refresh bar leaving the crop must not be replaced by a
    // green time-grid line. Canvas/video color conversion can strengthen grids.
    return this.yellow ? candidates.yellow : candidates.other;
  }
}
