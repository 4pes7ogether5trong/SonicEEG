const keys = ['hp', 'lp', 'notch', 'seconds', 'sensitivity'];
export function settingsWatchReference(confirmed, recognized) {
  return Object.fromEntries(
    keys
      .filter((k) => recognized?.[k] != null)
      .map((k) => [k, confirmed?.[k] ?? recognized[k]]),
  );
}
// Never advance a confirmed reference merely because OCR produced new text.
export function settingsDifference(confirmed, observed) {
  const changed = [],
    unreadable = [];
  for (const key of keys) {
    const a = confirmed?.[key],
      b = observed?.[key];
    if (a != null && b == null) unreadable.push(key);
    else if (b != null && String(a) !== String(b)) changed.push(key);
  }
  return {
    changed,
    unreadable,
    needsReview: Boolean(changed.length || unreadable.length),
  };
}
export function validFilters({ hp, lp, notch }) {
  return (
    (hp == null || (Number.isFinite(hp) && hp >= 0)) &&
    (lp == null || (Number.isFinite(lp) && lp > 0)) &&
    (hp == null || lp == null || hp < lp) &&
    [null, 'off', '50', '60'].includes(notch)
  );
}
