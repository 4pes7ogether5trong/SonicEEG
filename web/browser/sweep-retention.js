// Confirm a retained swept page using observed trace geometry. A completed tail
// may be read after the cursor wraps only while the old middle still matches.
// If the cursor is outside the crop, require new ink at the far end as well;
// a hidden cursor on an otherwise frozen screen does not complete a page.
export function retainedSweep(previous, current, from, confirmedWrap = false) {
  const n = current[0]?.samples.length;
  if (!n || from >= n || from < n * 0.7) return false;
  let stable = 0;
  const changedEnd = new Set();
  for (let row = 0; row < current.length; row++) {
    const a = previous[row],
      b = current[row];
    if (!a?.pixelY || !b.pixelY || !a.observed || !b.observed) continue;
    let compared = 0,
      matched = 0;
    for (let x = Math.floor(n * 0.25); x < Math.floor(n * 0.7); x += 3) {
      if (a.observed[x] !== 1 || b.observed[x] !== 1) continue;
      compared++;
      if (Math.abs(a.pixelY[x] - b.pixelY[x]) <= 2) matched++;
    }
    if (compared < n * 0.07 || matched / compared < 0.97) continue;
    stable++;
    for (let x = Math.max(from, n - 8); x < n; x++)
      if (a.observed[x] === 1 && b.observed[x] === 1 && Math.abs(a.pixelY[x] - b.pixelY[x]) > 2)
        changedEnd.add(x);
  }
  return stable >= Math.min(2, current.length) && (confirmedWrap || changedEnd.size >= 4);
}
