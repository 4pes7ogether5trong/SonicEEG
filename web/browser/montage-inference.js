import { TEMPLATES, POSITIONS, parseDerivation, auxiliaryChannel } from './montage.js';

function permutations(groups) {
  if (!groups.length) return [[]];
  return groups.flatMap((group, i) =>
    permutations(groups.filter((_, j) => i !== j)).map((rest) => [group, ...rest]),
  );
}
const extendedChains = [...TEMPLATES[0].chains.slice(0, 4), ['FP1-FZ', 'FZ-CZ', 'CZ-PZ', 'PZ-O1']];
const families = [
  ...TEMPLATES,
  {
    name: 'Bipolar · extended midline',
    channels: extendedChains.flat(),
    chains: extendedChains,
    // The extra midline electrodes must have visible evidence. Merely counting
    // two extra rows (which could be auxiliary channels) does not establish this.
    requiresAny: ['FP1-FZ', 'PZ-O1'],
  },
].map((family) => ({
  ...family,
  orders: permutations(family.chains).map((order) => order.flat()),
}));

// These are explicitly marked suggestions about labels on existing rows. Never
// append a row, invent voltage samples, use earlier suggestions as new evidence,
// or overwrite a name actually recovered by OCR.
export function suggestMontageLabels(input) {
  // A recognized ECG or eye channel is not a missing scalp electrode. Keep its
  // position while comparing the observed EEG rows with montage arrangements.
  if (input.some((row) => auxiliaryChannel(row.name))) {
    const result = suggestMontageLabels(input.filter((row) => !auxiliaryChannel(row.name)));
    let index = 0;
    return {
      ...result,
      rows: input.map((row) =>
        auxiliaryChannel(row.name) ? { ...row, ignore: true } : result.rows[index++],
      ),
    };
  }
  const rows = input.map((row) =>
    row.inferred ? { ...row, name: row.ocrName || '?', inferred: false } : { ...row },
  );
  const empty = () => ({ rows, inferred: 0, montage: null });
  if (!rows.some((r) => r.name === '?')) return empty();
  if (
    rows.some((r, i) => !Number.isFinite(r.y) || !(r.height > 0) || (i > 0 && r.y <= rows[i - 1].y))
  )
    return empty();
  const names = rows.map((r) => parseDerivation(r.name)?.name || null);
  if (rows.some((r, i) => !names[i] && r.name !== '?')) return empty();
  const known = names.filter(Boolean);
  // This threshold is an engineering gate, not a calibrated probability.
  if (
    known.length < Math.max(4, Math.ceil(rows.length / 2)) ||
    new Set(known).size !== known.length
  )
    return empty();
  const candidates = [];
  for (const family of families) {
    if (
      family.channels.length !== rows.length ||
      known.some((name) => !family.channels.includes(name)) ||
      (family.requiresAny && !family.requiresAny.some((name) => known.includes(name)))
    )
      continue;
    for (const order of family.orders) {
      if (names.every((name, i) => !name || name === order[i]))
        candidates.push({ name: family.name, order });
    }
  }
  // In a complete common-reference set with exactly one missing label, its
  // identity is unique even if the display uses an unfamiliar row ordering.
  if (rows.length - known.length === 1) {
    const parsed = known.map(parseDerivation),
      reference = parsed[0].b;
    if (parsed.every((p) => p.b === reference)) {
      const expected = Object.keys(POSITIONS)
        .slice(0, 19)
        .filter((e) => e !== reference)
        .map((e) => `${e}-${reference}`);
      if (expected.length === rows.length && known.every((n) => expected.includes(n))) {
        const missing = expected.filter((n) => !known.includes(n));
        if (missing.length === 1)
          candidates.push({
            name: `Referential (${reference})`,
            order: names.map((n) => n || missing[0]),
          });
      }
    }
  }
  if (!candidates.length) return empty();
  let inferred = 0;
  const proposed = rows.map((row, i) => {
    if (names[i]) return row;
    const options = new Set(candidates.map((c) => c.order[i]));
    if (options.size !== 1) return row;
    inferred++;
    return { ...row, name: [...options][0], ocrName: row.name, inferred: true };
  });
  return {
    rows: proposed,
    inferred,
    montage: inferred ? [...new Set(candidates.map((c) => c.name))].join(' / ') : null,
  };
}
