// OCR coordinates are relative to the user's single selected area. Keep all
// inferred regions inside it. Geometry always comes from the observed rows.
export function capturePixelRect(rect, [width, height]) {
  if (
    ![rect.x, rect.y, rect.w, rect.h, width, height].every(Number.isFinite) ||
    rect.w <= 0 ||
    rect.h <= 0 ||
    width < 1 ||
    height < 1
  )
    throw new Error('Capture dimensions are not ready. Select the EEG area again.');
  const x = Math.max(0, Math.min(width - 1, Math.round(rect.x * width)));
  const y = Math.max(0, Math.min(height - 1, Math.round(rect.y * height)));
  const right = Math.max(x + 1, Math.min(width, Math.round((rect.x + rect.w) * width)));
  const bottom = Math.max(y + 1, Math.min(height, Math.round((rect.y + rect.h) * height)));
  return { x, y, w: right - x, h: bottom - y };
}
export function nativeCaptureRect(rect, dimensions) {
  const p = capturePixelRect(rect, dimensions);
  return {
    x: p.x / dimensions[0],
    y: p.y / dimensions[1],
    w: p.w / dimensions[0],
    h: p.h / dimensions[1],
  };
}
export function rowsInArea(rows, labelRect, area) {
  return rows.map((row) => ({
    ...row,
    x0: (labelRect.x + row.x0 * labelRect.w - area.x) / area.w,
    x1: (labelRect.x + row.x1 * labelRect.w - area.x) / area.w,
    y: (labelRect.y + row.y * labelRect.h - area.y) / area.h,
    height: (row.height * labelRect.h) / area.h,
  }));
}
export function inferCaptureRegions(area, rows, [width, height]) {
  if (
    ![area.x, area.y, area.w, area.h, width, height].every(Number.isFinite) ||
    area.w <= 0 ||
    area.h <= 0 ||
    width <= 0 ||
    height <= 0
  )
    throw new Error('Capture dimensions are not ready. Select the EEG area again.');
  if (rows.length < 2 || rows.some((r) => !Number.isFinite(r.x1) || !Number.isFinite(r.height)))
    throw new Error(
      'Could not locate enough channel labels. Try a tighter EEG box, or use Adjust regions manually.',
    );
  const sorted = [...rows].sort((a, b) => a.y - b.y);
  const gaps = sorted
    .slice(1)
    .map((r, i) => r.y - sorted[i].y)
    .sort((a, b) => a - b);
  const spacing = gaps[Math.floor(gaps.length / 2)];
  if (!(spacing > 0)) throw new Error('Channel rows overlap. Adjust the selected area.');
  const left = Math.max(...rows.map((r) => r.x1)) + 5 / (area.w * width);
  // Outer rows have no neighboring trace on their outside edge. Preserve one
  // row of visible waveform headroom instead of cutting at an imaginary
  // midpoint. Stay inside the user's selected area and below distant headers.
  const top = Math.max(0, sorted[0].y - spacing);
  const bottom = Math.min(1, sorted.at(-1).y + spacing);
  if (left >= 0.65 || bottom <= top)
    throw new Error('Waveforms could not be separated from labels. Use Adjust regions manually.');
  return {
    plot: {
      x: area.x + left * area.w,
      y: area.y + top * area.h,
      w: (1 - left) * area.w,
      h: (bottom - top) * area.h,
    },
  };
}

// Corrections remain tied to the original OCR row. A repeat of the same bad
// spelling must not undo a user's correction or pause capture every five seconds.
export function labelWatchReference(observed, confirmedNames) {
  if (!observed.length || observed.length !== confirmedNames.length) return null;
  return observed.map((row, i) => ({
    y: row.y,
    height: row.height,
    accepted: [...new Set([row.ocrName ?? row.name, confirmedNames[i]])],
    automatic: !row.inferred && row.name === confirmedNames[i] && row.name !== '?',
  }));
}
export function labelsChanged(reference, observed) {
  if (!reference) return false;
  if (!observed || reference.length !== observed.length) return true;
  return reference.some(
    (row, i) =>
      !row.accepted.includes(observed[i].name) ||
      !Number.isFinite(observed[i].y) ||
      Math.abs(row.y - observed[i].y) > Math.max(0.005, row.height * 1.5),
  );
}
