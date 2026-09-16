import { clamp } from './signal.js';
// This operates only on an explicitly selected waveform crop. No OCR/header pixels.
export function extractTraces(
  image,
  rows,
  { uvPerPixel, negativeUp = true } = {},
) {
  const { width: w, height: h, data } = image;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < gray.length; i++)
    gray[i] =
      0.2126 * data[4 * i] +
      0.7152 * data[4 * i + 1] +
      0.0722 * data[4 * i + 2];
  const bg = Array.from(
    gray.filter(
      (_, i) => i % Math.max(1, Math.floor(gray.length / 1000)) === 0,
    ),
  ).sort((a, b) => a - b);
  const background = bg[Math.floor(bg.length * 0.5)] || 0,
    dark = background > 128;
  return rows.map((row, ri) => {
    const top = clamp(
      Math.floor(
        row.y -
          (ri
            ? row.y - rows[ri - 1].y
            : rows[1]?.y - row.y || h / rows.length) *
            0.46,
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
            0.46,
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
        if (ink > 45) counts[y]++;
      }
    // Long straight grid rules are weaker evidence than an adjacent varying trace.
    for (let y = 0; y < rh; y++)
      if (counts[y] > 0.92 * w)
        for (let x = 0; x < w; x++) score[x * rh + y] *= 0.12;
    const back = new Int16Array(w * rh),
      prev = new Float64Array(rh),
      cur = new Float64Array(rh),
      left = new Float64Array(rh),
      leftIndex = new Int16Array(rh),
      right = new Float64Array(rh),
      rightIndex = new Int16Array(rh);
    for (let y = 0; y < rh; y++)
      prev[y] = score[y] - 0.2 * Math.abs(top + y - row.y);
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
      observed = new Uint8Array(w);
    let good = 0,
      clipped = 0;
    for (let x = w - 1; x >= 0; x--) {
      pixelY[x] = top + y;
      observed[x] = score[x * rh + y] > 32 ? 1 : 0;
      good += observed[x];
      if (y < 2 || y >= rh - 2) clipped++;
      samples[x] = (top + y - row.y) * (negativeUp ? 1 : -1) * uvPerPixel;
      y = back[x * rh + y];
    }
    return {
      name: row.name,
      samples,
      pixelY,
      observed,
      quality: good / w,
      clipped: clipped / w,
      valid: good / w > 0.85 && clipped / w < 0.025,
    };
  });
}
export function findSweepCursor(image) {
  const { width: w, height: h, data } = image;
  let best = -1,
    bestScore = 0;
  for (let x = 1; x < w - 1; x++) {
    let count = 0;
    for (let y = 0; y < h; y += 3) {
      const i = (y * w + x) * 4,
        sat =
          Math.max(data[i], data[i + 1], data[i + 2]) -
          Math.min(data[i], data[i + 1], data[i + 2]);
      if (sat > 95) count++;
    }
    const score = count / Math.ceil(h / 3);
    if (score > bestScore) {
      bestScore = score;
      best = x;
    }
  }
  return bestScore > 0.7 ? best : null;
}
