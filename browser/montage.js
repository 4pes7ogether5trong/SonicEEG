// Sensor-space coordinates are schematic 10-20 positions, not source estimates.
export const POSITIONS = {
  FP1: [-0.28, 0.32, -0.9],
  FP2: [0.28, 0.32, -0.9],
  F7: [-0.8, 0.35, -0.48],
  F3: [-0.42, 0.76, -0.48],
  FZ: [0, 0.85, -0.5],
  F4: [0.42, 0.76, -0.48],
  F8: [0.8, 0.35, -0.48],
  T7: [-1, 0.12, 0],
  C3: [-0.5, 0.86, 0],
  CZ: [0, 1, 0],
  C4: [0.5, 0.86, 0],
  T8: [1, 0.12, 0],
  P7: [-0.8, 0.35, 0.48],
  P3: [-0.42, 0.76, 0.48],
  PZ: [0, 0.85, 0.5],
  P4: [0.42, 0.76, 0.48],
  P8: [0.8, 0.35, 0.48],
  O1: [-0.28, 0.32, 0.9],
  O2: [0.28, 0.32, 0.9],
  F9: [-0.87, -0.15, -0.5],
  F10: [0.87, -0.15, -0.5],
  T9: [-1, -0.2, 0],
  T10: [1, -0.2, 0],
  P9: [-0.87, -0.15, 0.5],
  P10: [0.87, -0.15, 0.5],
  A1: [-1.03, -0.12, 0.12],
  A2: [1.03, -0.12, 0.12],
  M1: [-1.03, -0.12, 0.12],
  M2: [1.03, -0.12, 0.12],
};
const ALIASES = { T3: 'T7', T4: 'T8', T5: 'P7', T6: 'P8' };
const REFS = new Set(['REF', 'AVG', 'AV', 'CAR', 'LE', 'RE', 'A1+A2', 'M1+M2']);
export function electrode(s) {
  const c = String(s).trim().toUpperCase();
  return ALIASES[c] || c;
}
export function parseDerivation(input) {
  const clean = String(input)
    .toUpperCase()
    .replace(/^\s*(?:\d+[.:)]\s*)?EEG\s*/, '')
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, '')
    .trim();
  const parts = clean.split('-');
  if (parts.length !== 2) return null;
  const a = electrode(parts[0]),
    b = electrode(parts[1]);
  if (!POSITIONS[a] || (!POSITIONS[b] && !REFS.has(b)) || a === b) return null;
  return { name: `${a}-${b}`, a, b, bipolar: !!POSITIONS[b] };
}
const chain = (s) =>
  s
    .split(' ')
    .slice(1)
    .map((b, i) => s.split(' ')[i] + '-' + b);
const LB = [
  ...chain('FP1 F7 T7 P7 O1'),
  ...chain('FP2 F8 T8 P8 O2'),
  ...chain('FP1 F3 C3 P3 O1'),
  ...chain('FP2 F4 C4 P4 O2'),
  ...chain('FZ CZ PZ'),
];
const TB = [
  ...chain('F7 FP1 FP2 F8'),
  ...chain('F7 F3 FZ F4 F8'),
  ...chain('T7 C3 CZ C4 T8'),
  ...chain('P7 P3 PZ P4 P8'),
  ...chain('P7 O1 O2 P8'),
];
export const TEMPLATES = [
  { name: 'Longitudinal bipolar', channels: LB },
  { name: 'Transverse bipolar', channels: TB },
];
const scalp = Object.keys(POSITIONS).slice(0, 19);
export function recognizeMontage(labels) {
  const parsed = labels.map(parseDerivation).filter(Boolean),
    names = [...new Set(parsed.map((p) => p.name))];
  const candidates = TEMPLATES.map((t) => ({
    ...t,
    matched: names.filter((n) => t.channels.includes(n)).length,
  }));
  for (const ref of [...REFS, 'A1', 'A2', 'M1', 'M2', 'CZ']) {
    const channels = scalp.filter((n) => n !== ref).map((n) => `${n}-${ref}`);
    candidates.push({
      name: `Referential (${ref})`,
      channels,
      matched: names.filter((n) => channels.includes(n)).length,
    });
  }
  candidates.sort((a, b) => b.matched - a.matched);
  const best = candidates[0],
    next = candidates[1];
  const match =
    names.length >= 4 &&
    best.matched / names.length >= 0.9 &&
    best.matched > next.matched;
  return {
    name: match ? best.name : 'Custom / incomplete',
    match: !!match,
    observed: names,
    expected: match ? best.channels : [],
    missing: match ? best.channels.filter((n) => !names.includes(n)) : [],
    alternatives: candidates
      .filter((c) => c.matched === best.matched)
      .map((c) => c.name),
  };
}
export function parseSettings(text) {
  const s = String(text).replace(/μ/g, 'µ');
  const value = (pattern) => {
    const m = s.match(pattern);
    return m ? Number(m[1]) : null;
  };
  const hp = value(
    /(?:H\s*P\s*F?|LFF|low\s*(?:frequency\s*)?filter|high[ -]?pass)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*Hz/i,
  );
  const lp = value(
    /(?:L\s*P\s*F?|HFF|high\s*(?:frequency\s*)?filter|low[ -]?pass)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*Hz/i,
  );
  const notch =
    s.match(/notch\s*[:=]?\s*(off|on|50|60)(?:\s*Hz)?/i)?.[1]?.toLowerCase() ??
    null;
  const seconds = value(
    /(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)\s*\/\s*(?:page|screen)/i,
  );
  const sensitivity = value(/(\d+(?:\.\d+)?)\s*(?:µV|uV)\s*\/\s*mm/i);
  return { hp, lp, notch, seconds, sensitivity }; // No OCR text or patient identifiers leave this function.
}
export function findDerivations(text) {
  return [
    ...String(text)
      .toUpperCase()
      .replace(/[–—−]/g, '-')
      .matchAll(
        /\b(?:FP[12]|F(?:[34789]|10|Z)|C[34Z]|T(?:[3456789]|10)|P(?:[34789]|10|Z)|O[12])\s*-\s*(?:FP[12]|F(?:[34789]|10|Z)|C[34Z]|T(?:[3456789]|10)|P(?:[34789]|10|Z)|O[12]|REF|AVG|AV|CAR|A1\+A2|M1\+M2|A[12]|M[12]|LE|RE)\b/g,
      ),
  ]
    .map((m) => parseDerivation(m[0]))
    .filter(Boolean);
}
export function labelCandidates(text) {
  // Suggestions only. Never change an authoritative derivation or keep arbitrary OCR text.
  const repair = (s) =>
    s
      .replace(/^0([12])$/, 'O$1')
      .replace(/^FP[IL]$/, 'FP1')
      .replace(/^[I1]([3456789]|10)$/, 'T$1');
  return [
    ...String(text)
      .toUpperCase()
      .replace(/[–—−]/g, '-')
      .matchAll(/\b([A-Z0-9+]+)\s*-\s*([A-Z0-9+]+)\b/g),
  ].flatMap((m) => {
    const original = parseDerivation(m[0]);
    const d = original || parseDerivation(`${repair(m[1])}-${repair(m[2])}`);
    return d ? [{ ...d, corrected: !original }] : [];
  });
}
export function derive(target, channels) {
  // Exact graph paths only; disconnected electrode groups remain unrecoverable.
  const d = parseDerivation(target);
  if (!d) return null;
  const edges = new Map();
  for (const c of channels) {
    const p = parseDerivation(c.name);
    if (!p || !c.samples?.length || c.valid === false) continue;
    for (const [a, b, sign] of [
      [p.a, p.b, 1],
      [p.b, p.a, -1],
    ]) {
      if (!edges.has(a)) edges.set(a, []);
      edges.get(a).push({ to: b, sign, c });
    }
  }
  const queue = [{ node: d.a, path: [] }],
    seen = new Set([d.a]);
  while (queue.length) {
    const { node, path } = queue.shift();
    if (node === d.b) {
      const n = path[0].c.samples.length,
        meta = path[0].c;
      if (
        path.some(
          (e) =>
            e.c.samples.length !== n ||
            e.c.segment !== meta.segment ||
            e.c.start !== meta.start ||
            e.c.rate !== meta.rate,
        )
      )
        return null;
      const samples = Float32Array.from({ length: n }, (_, i) =>
        path.reduce((v, e) => v + e.sign * e.c.samples[i], 0),
      );
      return {
        ...meta,
        name: d.name,
        samples,
        status: 'derived',
        from: path.map((e) => e.c.name),
      };
    }
    for (const e of edges.get(node) || [])
      if (!seen.has(e.to)) {
        seen.add(e.to);
        queue.push({ node: e.to, path: [...path, e] });
      }
  }
  return null;
}
