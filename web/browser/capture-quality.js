// Visibility accounting only. This is not a score of channel identity or accuracy.
// Every confirmed row contributes the full recent interval, including silent
// capture failures and rows with no recovered fragments.
export function recentTraceQuality(rows, seconds = 4) {
  let expected = 0,
    ink = 0,
    repaired = 0,
    duration = 0;
  for (const row of rows) {
    if (!Number.isFinite(row.end) || !(row.elapsed > 0)) continue;
    const span = Math.min(Math.max(0, seconds), row.elapsed);
    const from = row.end - span;
    duration = Math.max(duration, span);
    expected += span;
    let coveredUntil = from;
    for (const fragment of row.fragments || []) {
      if (!(fragment.rate > 0)) continue;
      for (let i = 0; i < fragment.samples.length; i++) {
        const sampleStart = fragment.start + i / fragment.rate;
        const a = Math.max(from, coveredUntil, sampleStart);
        const b = Math.min(row.end, fragment.end, sampleStart + 1 / fragment.rate);
        if (!(b > a)) continue;
        coveredUntil = b;
        if (!Number.isFinite(fragment.samples[i])) continue;
        if (fragment.observed[i] === 1) ink += b - a;
        else if (fragment.observed[i] === 2) repaired += b - a;
      }
    }
  }
  const observed = expected ? ink / expected : 0;
  const reconstruction = expected ? repaired / expected : 0;
  return {
    duration,
    channels: rows.length,
    expectedSeconds: expected,
    observed,
    repaired: reconstruction,
    missing: expected ? Math.max(0, 1 - observed - reconstruction) : 0,
  };
}
