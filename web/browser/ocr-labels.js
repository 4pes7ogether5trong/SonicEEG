import { labelCandidates, auxiliaryChannel } from './montage.js';

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// This parser is only for OCR suggestions; authoritative montage parsing stays
// strict. Missing dashes are recoverable only between two recognized electrodes.
export function readChannelLabel(text) {
  const auxiliary = auxiliaryChannel(text);
  if (auxiliary) return { ...auxiliary, corrected: false };
  const auxPrefix = String(text)
    .trim()
    .match(/^(ECG|EKG|EMG|EOG|SpO2|Sp02)(?=[\s-]|LA|RA|$)/i);
  if (auxPrefix)
    return { ...auxiliaryChannel(auxPrefix[1].replace(/Sp02/i, 'SPO2')), corrected: false };
  if (/^PR\s+No\b/i.test(String(text).trim()))
    return { name: 'PR', ignore: true, corrected: false };
  const eye = String(text)
    .trim()
    .match(/^A([1IL2])\s*-\s*E([12])\s*$/i);
  if (eye)
    return {
      ...auxiliaryChannel(`A${eye[1].toUpperCase().replace(/[IL]/, '1')}-E${eye[2]}`),
      corrected: /[IL]/i.test(eye[1]),
    };
  const found = labelCandidates(text);
  if (found.length === 1) return found[0];
  const spaced = String(text)
    .trim()
    .match(/^([a-z0-9+]+)\s+([a-z0-9+]+)\s*$/i);
  if (spaced) {
    const pair = labelCandidates(`${spaced[1]}-${spaced[2]}`);
    if (pair.length === 1) return { ...pair[0], corrected: true };
  }
  // A dropped separator is recoverable only for one complete, unambiguous pair.
  const compact = String(text).trim();
  if (/^[a-z0-9+]+$/i.test(compact)) {
    const possible = [];
    for (let i = 1; i < compact.length; i++)
      possible.push(...labelCandidates(`${compact.slice(0, i)}-${compact.slice(i)}`));
    if (new Set(possible.map((p) => p.name)).size === 1) return { ...possible[0], corrected: true };
  }
  return null;
}

function inkThreshold(gray) {
  const hist = new Uint32Array(256);
  for (const v of gray) hist[v]++;
  // Keep existing dark-stroke handling when it has sufficient evidence. The
  // adaptive pass addresses faint text, without thickening normal JPEG glyphs.
  let dark = 0;
  for (let i = 0; i < 155; i++) dark += hist[i];
  if (dark >= gray.length * 0.003) return 154;
  let total = 0;
  for (let i = 0; i < 256; i++) total += i * hist[i];
  let weight = 0,
    sum = 0,
    best = -1,
    threshold = 155;
  for (let i = 0; i < 255; i++) {
    weight += hist[i];
    sum += i * hist[i];
    if (!weight || weight === gray.length) continue;
    const difference = sum / weight - (total - sum) / (gray.length - weight);
    const variance = weight * (gray.length - weight) * difference * difference;
    if (variance > best) {
      best = variance;
      threshold = i;
    }
  }
  // Preserve the established threshold for normal contrast; lift it only when
  // faint text would otherwise disappear. Over-sharpening JPEGs loses strokes.
  return clamp(threshold, 154, 205);
}

export function labelPixels(
  image,
  rect,
  { binary = true, scale = 3, padding = 8, colorMode = 'all' } = {},
) {
  const left = clamp(Math.floor(rect.left), 0, image.width - 1),
    top = clamp(Math.floor(rect.top), 0, image.height - 1),
    right = clamp(Math.ceil(rect.right), left + 1, image.width),
    bottom = clamp(Math.ceil(rect.bottom), top + 1, image.height);
  const w = right - left,
    h = bottom - top;
  let light = 0,
    count = 0;
  for (let y = top; y < bottom; y += 3)
    for (let x = left; x < right; x += 3) {
      const i = (y * image.width + x) * 4;
      if (Math.max(image.data[i], image.data[i + 1], image.data[i + 2]) > 128) light++;
      count++;
    }
  const invert = light < count / 2;
  const gray = new Uint8Array(w * h);
  let hasColor = false;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = ((top + y) * image.width + left + x) * 4;
      // A saturated red/blue label on white still has one channel at 255.
      // Taking max(R,G,B) erases it, leaving only black midline labels. Preserve
      // contrast in *any* color component; pale grid lines remain pale.
      const minimum = Math.min(image.data[i], image.data[i + 1], image.data[i + 2]);
      const maximum = Math.max(image.data[i], image.data[i + 1], image.data[i + 2]);
      hasColor ||= maximum - minimum > 32;
      const v = invert
        ? 255 - (colorMode === 'neutral' ? minimum : maximum)
        : colorMode === 'neutral'
          ? maximum
          : minimum;
      gray[y * w + x] = v;
    }
  if (binary) {
    const threshold = inkThreshold(gray);
    for (let i = 0; i < gray.length; i++) gray[i] = gray[i] <= threshold ? 0 : 255;
  }
  // Long rules are not letters. Test over the full selected height, so a short
  // vertical letter stroke in an individual row is never removed here.
  if (h > 100)
    for (let x = 0; x < w; x++) {
      let ink = 0;
      for (let y = 0; y < h; y++) if (gray[y * w + x] < 155) ink++;
      if (ink > h * 0.45) for (let y = 0; y < h; y++) gray[y * w + x] = 255;
    }
  const width = w * scale + padding * 2,
    height = h * scale + padding * 2;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 0; y < h * scale; y++)
    for (let x = 0; x < w * scale; x++) {
      const v = gray[Math.floor(y / scale) * w + Math.floor(x / scale)];
      const i = ((y + padding) * width + x + padding) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
    }
  return {
    width,
    height,
    data,
    left,
    top,
    scale,
    padding,
    gray,
    hasColor,
    sourceWidth: w,
    sourceHeight: h,
  };
}

function lines(data) {
  return (data.blocks || []).flatMap((b) => (b.paragraphs || []).flatMap((p) => p.lines || []));
}
function rowsFrom(data, pixels) {
  return lines(data).flatMap((line) => {
    const match = readChannelLabel(line.text || '');
    if (!match) return [];
    let box = line.bbox;
    const words = line.words || [];
    outer: for (let i = 0; i < words.length; i++)
      for (let n = 1; n <= 4 && i + n <= words.length; n++) {
        const part = words.slice(i, i + n),
          d = readChannelLabel(part.map((w) => w.text).join(' '));
        if (d?.name === match.name) {
          box = {
            x0: Math.min(...part.map((w) => w.bbox.x0)),
            x1: Math.max(...part.map((w) => w.bbox.x1)),
            y0: Math.min(...part.map((w) => w.bbox.y0)),
            y1: Math.max(...part.map((w) => w.bbox.y1)),
          };
          break outer;
        }
      }
    if (!box) return [];
    return [
      {
        name: match.name,
        ignore: match.ignore === true,
        corrected: match.corrected,
        confidence: line.confidence || 0,
        left: pixels.left + (box.x0 - pixels.padding) / pixels.scale,
        right: pixels.left + (box.x1 - pixels.padding) / pixels.scale,
        top: pixels.top + (box.y0 - pixels.padding) / pixels.scale,
        bottom: pixels.top + (box.y1 - pixels.padding) / pixels.scale,
      },
    ];
  });
}

function resolveReadings(rows) {
  const names = [
    ...new Set(rows.flatMap((r) => r.alternatives || [r.name]).filter((n) => n !== '?')),
  ];
  const best = [...rows].sort((a, b) => b.confidence - a.confidence)[0];
  return {
    ...best,
    name: names.length === 1 ? names[0] : '?',
    alternatives: names,
    corrected: rows.some((r) => r.corrected),
  };
}
function mergeRows(rows) {
  const groups = [];
  for (const row of rows.sort((a, b) => a.top - b.top)) {
    const cy = (row.top + row.bottom) / 2;
    const group = groups.find(
      (g) => Math.abs(cy - g.y) < Math.max(4, (row.bottom - row.top) * 0.75),
    );
    if (group) group.rows.push(row);
    else groups.push({ y: cy, rows: [row] });
  }
  return groups.map((g) => resolveReadings(g.rows));
}

function rowBands(pixels, glyphHeight, complete = false) {
  const w = pixels.sourceWidth,
    h = pixels.sourceHeight,
    score = [];
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (pixels.gray[y * w + x] < 155) n++;
    score.push(n);
  }
  const bands = [];
  let start = -1;
  for (let y = 0; y <= h; y++) {
    const threshold = complete
      ? Math.max(3, Math.min(w * 0.11, glyphHeight * 0.5))
      : Math.max(4, w * 0.11);
    const ink = y < h && score[y] >= threshold;
    if (ink && start < 0) start = y;
    if (!ink && start >= 0) {
      const last = bands.at(-1);
      if (last && start - last.bottom <= (complete ? Math.max(2, glyphHeight * 0.35) : 2))
        last.bottom = y;
      else bands.push({ top: start, bottom: y });
      start = -1;
    }
  }
  return bands
    .filter(
      (b) =>
        b.bottom - b.top >= Math.max(3, glyphHeight * 0.4) && b.bottom - b.top < glyphHeight * 2.2,
    )
    .map((b) => ({ top: b.top + pixels.top, bottom: b.bottom + pixels.top }));
}

export function locateLabelGeometry(image, { column, anchors = [], expectedCount } = {}) {
  if (!Number.isInteger(expectedCount) || expectedCount < 1 || expectedCount > 128)
    throw new Error('Enter between 1 and 128 visible channel rows.');
  const glyphHeight = column?.glyphHeight || (image.height / expectedCount) * 0.35;
  const left = column?.left ?? 0,
    right = column?.right ?? image.width;
  const pixels = labelPixels(
    image,
    { left, right, top: 0, bottom: image.height },
    { scale: 1, padding: 0 },
  );
  const bands = rowBands(pixels, glyphHeight, true);
  const candidates = [];
  for (let start = 0; start + expectedCount <= bands.length; start++) {
    const rows = bands.slice(start, start + expectedCount);
    const centers = rows.map((b) => (b.top + b.bottom) / 2);
    if (anchors.some((a) => !centers.some((y) => Math.abs(y - a.y * image.height) <= glyphHeight)))
      continue;
    const gaps = centers.slice(1).map((y, i) => y - centers[i]);
    const spacing = gaps.length ? median(gaps) : image.height;
    if (gaps.some((gap) => gap < spacing * 0.5 || gap > spacing * 2.5)) continue;
    const score =
      gaps.reduce((sum, gap) => sum + Math.abs(gap - spacing) / spacing, 0) /
      Math.max(1, gaps.length);
    candidates.push({ rows, score });
  }
  candidates.sort((a, b) => a.score - b.score);
  if (!candidates.length || (candidates[1] && candidates[1].score - candidates[0].score < 0.015))
    throw new Error(
      `${expectedCount} names entered; ${bands.length} text rows located. Draw a tighter label box around exactly those rows.`,
    );
  return candidates[0].rows.map((b) => ({
    name: '?',
    manual: true,
    y: (b.top + b.bottom) / 2 / image.height,
    height: (b.bottom - b.top) / image.height,
    x0: pixels.left / image.width,
    x1: (pixels.left + pixels.sourceWidth) / image.width,
  }));
}

// The callback uses the same local Tesseract worker in browser and regression
// tests. No montage preset, demographic information or remote OCR is consulted.
export async function recognizeLabelImage(image, scan, { combined = true } = {}) {
  const matches = [];
  const widths = combined ? [0.12, 0.22, 0.36] : [1];
  for (const fraction of widths) {
    const p = labelPixels(image, {
      left: 0,
      top: 0,
      right: image.width * fraction,
      bottom: image.height,
    });
    matches.push(...rowsFrom(await scan(p, '6'), p));
  }
  let anchors = mergeRows(matches);
  // Wide clinical windows can devote only 3–5% of their width to names. A
  // broad column merges the adjacent waveform into the letters. Retry narrow
  // columns before requiring readable anchors for the individual-row pass.
  if (combined || anchors.filter((r) => !auxiliaryChannel(r.name)).length < 2) {
    for (const fraction of combined ? [0.035, 0.045, 0.065] : [0.55, 0.7, 0.85]) {
      const p = labelPixels(
        image,
        { left: 0, top: 0, right: image.width * fraction, bottom: image.height },
        { binary: false },
      );
      matches.push(...rowsFrom(await scan(p, '6'), p));
    }
    anchors = mergeRows(matches);
  }
  if (anchors.filter((r) => !auxiliaryChannel(r.name)).length < 2) {
    const p = labelPixels(
      image,
      { left: 0, top: 0, right: image.width * (combined ? 0.45 : 1), bottom: image.height },
      { binary: false },
    );
    anchors = mergeRows([...matches, ...rowsFrom(await scan(p, '11'), p)]);
  }
  if (anchors.filter((r) => !auxiliaryChannel(r.name)).length < 2)
    return {
      rows: [],
      unresolved: 0,
      incomplete: true,
      column: { left: 0, right: image.width * (combined ? 0.45 : 1), glyphHeight: null },
    };
  // A text column is inferred from actual recognized glyph positions, then
  // inspected across the entire selection (including above/below the anchors).
  const scalpAnchors = anchors.filter((r) => !auxiliaryChannel(r.name));
  const glyphHeight = median(scalpAnchors.map((r) => r.bottom - r.top));
  const left = Math.max(0, median(scalpAnchors.map((r) => r.left)) - 3);
  const right = Math.min(
    image.width,
    Math.max(...scalpAnchors.map((r) => r.right)) + glyphHeight * 0.6,
  );
  const column = labelPixels(
    image,
    { left, top: 0, right, bottom: image.height },
    { scale: 1, padding: 0 },
  );
  const bands = rowBands(column, glyphHeight);
  const cleaned = labelPixels(
    image,
    { left: 0, top: 0, right: image.width, bottom: image.height },
    { binary: false, scale: 1, padding: 0 },
  );
  // Black names can be joined to colored trace strokes. An independent neutral
  // pass removes those strokes; the color-preserving pass still reads colored
  // names. A disagreement is unresolved, never a reason to prefer one spelling.
  const neutral = cleaned.hasColor
    ? labelPixels(
        image,
        { left: 0, top: 0, right: image.width, bottom: image.height },
        { binary: false, scale: 1, padding: 0, colorMode: 'neutral' },
      )
    : null;
  const rows = [];
  for (const band of bands) {
    const y = (band.top + band.bottom) / 2;
    const anchor = anchors.find(
      (r) => y >= r.top - glyphHeight * 0.3 && y <= r.bottom + glyphHeight * 0.3,
    );
    const rect = { left, right, top: band.top - 2, bottom: band.bottom + 2 };
    const candidates = anchor ? [anchor] : [];
    let possible = false;
    // Independent line reads separate narrow letter strokes from attached
    // waveforms. A crop or scale that changes an electrode name cannot silently
    // override another successful read (notably P3 versus PZ).
    for (const input of neutral ? [cleaned, neutral] : [cleaned])
      for (const [mode, scale, trim] of [
        ['7', 3, 0],
        ['7', 4, 1],
        ['13', 4, 1.8],
      ]) {
        const p = labelPixels(
          input,
          { ...rect, right: Math.max(left + glyphHeight * 3, right - glyphHeight * trim) },
          { binary: false, scale },
        );
        const result = await scan(p, mode);
        const found = rowsFrom(result, p);
        if (found.length === 1) candidates.push(found[0]);
        possible ||= /[a-z0-9]\s*[-–—]\s*[a-z0-9?]/i.test(result.text || '');
      }
    if (!candidates.length && possible) {
      const p = labelPixels(cleaned, {
        ...rect,
        right: Math.max(left + glyphHeight * 3, right - glyphHeight),
      });
      const found = rowsFrom(await scan(p, '7', { uppercase: true }), p);
      if (found.length === 1) candidates.push(found[0]);
    }
    // A row-like label with a separator can be explicitly unresolved. Toolbar
    // words and blank rows are not invented as EEG channels.
    if (candidates.length)
      rows.push({ ...resolveReadings(candidates), top: band.top, bottom: band.bottom });
    else if (possible)
      rows.push({ name: '?', left, right, ...band, confidence: 0, corrected: false });
  }
  for (const anchor of anchors)
    if (
      !rows.some((r) => Math.abs((r.top + r.bottom - anchor.top - anchor.bottom) / 2) < glyphHeight)
    )
      rows.push(anchor);
  const merged = mergeRows(rows).sort((a, b) => a.top - b.top);
  // A duplicate may be a real repeated derivation or an OCR substitution. The
  // capture mapper cannot safely distinguish those without the user's edit.
  const counts = new Map();
  for (const row of merged)
    if (row.name !== '?' && !auxiliaryChannel(row.name))
      counts.set(row.name, (counts.get(row.name) || 0) + 1);
  for (const row of merged) if (counts.get(row.name) > 1) row.name = '?';
  const unresolved = merged.filter((r) => r.name === '?').length;
  return {
    rows: merged.map((r) => ({
      name: r.name,
      ignore: auxiliaryChannel(r.name)?.ignore === true,
      corrected: r.corrected,
      confidence: r.confidence,
      y: (r.top + r.bottom) / 2 / image.height,
      x0: r.left / image.width,
      x1: r.right / image.width,
      height: (r.bottom - r.top) / image.height,
    })),
    unresolved,
    incomplete: unresolved > 0 || merged.length < 4,
    column: { left, right, glyphHeight },
  };
}
