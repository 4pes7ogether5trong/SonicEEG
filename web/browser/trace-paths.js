// Extend row-lane seeds only along unbranched, visible ink paths. A crossing,
// merge, missing stroke, or conflicting channel label cannot become evidence.
// This does not interpolate a trace through another derivation.
export function extendTracePaths(
  image,
  rows,
  traces,
  colors,
  { background, dark, occluded, previous },
) {
  const { width: w, height: h, data } = image;
  const byName = new Map(traces.map((c) => [c.name, c]));
  for (const trace of traces) trace.identity = new Uint8Array(w);
  const spacing = rows.map((r, i) =>
    Math.min(r.y - (rows[i - 1]?.y ?? r.y - 40), (rows[i + 1]?.y ?? r.y + 40) - r.y),
  );
  const sameColor = (a, b) => (a && b ? Math.hypot(...a.map((v, i) => v - b[i])) < 0.35 : !a && !b);
  const stable = new Uint8Array(w);
  if (previous?.image.width === w && previous.image.height === h) {
    const old = previous.image.data;
    for (let x = 0; x < w; x++) {
      stable[x] = 1;
      for (let y = 0; y < h; y++) {
        const p = (y * w + x) * 4;
        if (data[p] !== old[p] || data[p + 1] !== old[p + 1] || data[p + 2] !== old[p + 2]) {
          stable[x] = 0;
          break;
        }
      }
    }
  }
  const prior = new Map((previous?.traces || []).map((c) => [c.name, c]));
  for (let first = 0; first < rows.length; ) {
    let last = first;
    while (
      last + 1 < rows.length &&
      !rows[last].ignore &&
      !rows[last + 1].ignore &&
      sameColor(colors[first], colors[last + 1]) &&
      rows[last + 1].y - rows[last].y < 1.8 * Math.min(spacing[last], spacing[last + 1])
    )
      last++;
    const members = rows.slice(first, last + 1).map((r) => byName.get(r.name));
    if (rows[first].ignore || members.length < 2) {
      first = last + 1;
      continue;
    }
    const top = Math.max(0, Math.floor(rows[first].y - spacing[first]));
    const bottom = Math.min(h, Math.ceil(rows[last].y + spacing[last]));
    const color = colors[first],
      threshold = color ? 16 : 32;
    const columns = [],
      nodes = [];
    const ink = (x, y) => {
      const p = (y * w + x) * 4,
        r = data[p],
        g = data[p + 1],
        b = data[p + 2];
      const low = Math.min(r, g, b),
        high = Math.max(r, g, b),
        sat = high - low;
      if (color) {
        if (
          sat < 20 ||
          Math.hypot(
            (r - low) / sat - color[0],
            (g - low) / sat - color[1],
            (b - low) / sat - color[2],
          ) > 0.6
        )
          return 0;
        return Math.max(0, (dark ? background - low : high - background) - 12) + sat * 0.3;
      }
      return (
        Math.max(
          0,
          (dark
            ? background - (0.2126 * r + 0.7152 * g + 0.0722 * b)
            : 0.2126 * r + 0.7152 * g + 0.0722 * b - background) - 18,
        ) + (sat > 60 ? 40 : 0)
      );
    };
    for (let x = 0; x < w; x++) {
      const column = [];
      if (!occluded[x])
        for (let y = top; y < bottom; y++) {
          let value = ink(x, y);
          if (value <= threshold) continue;
          const from = y;
          let weight = 0,
            sum = 0;
          while (y < bottom && (value = ink(x, y)) > threshold) {
            weight += value;
            sum += value * y;
            y++;
          }
          const node = {
            id: nodes.length,
            x,
            from,
            to: y - 1,
            center: sum / weight,
            left: [],
            right: [],
            labels: new Set(),
            seeds: 0,
          };
          nodes.push(node);
          column.push(node);
        }
      columns.push(column);
      for (const a of columns[x - 1] || [])
        for (const b of column) {
          // Raster line connectivity, not a guessed physiological slope limit.
          if (a.to + 1 >= b.from && b.to + 1 >= a.from) {
            a.right.push(b.id);
            b.left.push(a.id);
          }
        }
      for (let ri = first; ri <= last; ri++) {
        const trace = members[ri - first],
          old = prior.get(trace.name);
        const coreSeed =
          trace.observed[x] === 1 &&
          !trace.clippedPixels[x] &&
          Math.abs(trace.pixelY[x] - rows[ri].y) < spacing[ri] * 0.15;
        const temporalSeed =
          stable[x] && old?.identity?.[x] === 1 && old.observed[x] === 1 && !old.clippedPixels[x];
        for (const node of column) {
          const includes = (y) => y >= node.from && y <= node.to;
          if (
            (coreSeed && includes(trace.pixelY[x])) ||
            (temporalSeed && includes(old.pixelY[x]))
          ) {
            node.labels.add(ri);
            node.seeds++;
          }
        }
      }
    }
    const branched = (n) => n.left.length > 1 || n.right.length > 1;
    // Ambiguity must invalidate original lane samples too, not just extensions.
    // A disconnected raster stroke is not automatically a crossing; reject
    // actual branches, conflicting labels, and unanchored branches between
    // crossings. Never repair these exclusions back into a waveform.
    for (const trace of members) trace.identityBlocked = new Uint8Array(w);
    const reject = (node, owner = -1) => {
      for (let ri = first; ri <= last; ri++) {
        if (ri === owner) continue;
        const trace = members[ri - first],
          y = trace.pixelY[node.x];
        if (y >= node.from && y <= node.to) {
          trace.observed[node.x] = 0;
          trace.identityBlocked[node.x] = 1;
        }
      }
    };
    for (const node of nodes) if (branched(node)) reject(node);
    const visited = new Uint8Array(nodes.length);
    for (const initial of nodes) {
      if (visited[initial.id] || branched(initial)) continue;
      const chain = [],
        labels = new Set();
      let seeds = 0;
      const pending = [initial];
      while (pending.length) {
        const node = pending.pop();
        if (visited[node.id] || branched(node)) continue;
        visited[node.id] = 1;
        chain.push(node);
        seeds += node.seeds;
        for (const label of node.labels) labels.add(label);
        for (const id of [...node.left, ...node.right]) if (!visited[id]) pending.push(nodes[id]);
      }
      if (labels.size !== 1 || seeds < 4) {
        const touchesCrossing = chain.some((node) =>
          [...node.left, ...node.right].some((id) => branched(nodes[id])),
        );
        if (labels.size > 1 || touchesCrossing) for (const node of chain) reject(node);
        continue;
      }
      const ri = [...labels][0],
        trace = members[ri - first];
      for (const node of chain) {
        const x = node.x;
        reject(node, ri);
        if (node.from <= top + 1 || node.to >= bottom - 2) continue;
        // A neighboring seed owning the same stroke was rejected above. The
        // whole visible stroke supplies its center even when the narrow lane
        // found only one edge. Branches and conflicting labels remain absent.
        trace.identity[x] = 1;
        trace.identityBlocked[x] = 0;
        if (
          trace.observed[x] === 1 &&
          !trace.clippedPixels[x] &&
          trace.pixelY[x] >= node.from &&
          trace.pixelY[x] <= node.to
        ) {
          trace.sampleY[x] = node.center;
          trace.observed[x] = 1;
          trace.clippedPixels[x] = 0;
          continue;
        }
        trace.pixelY[x] = node.center;
        trace.sampleY[x] = node.center;
        trace.observed[x] = 1;
        trace.clippedPixels[x] = 0;
        trace.trackedPixels = (trace.trackedPixels || 0) + 1;
      }
    }
    first = last + 1;
  }
  return traces;
}
