// Presentation only: fade complete measured snapshots; never interpolate EEG
// samples, analysis flags, timestamps or missingness into new measurements.
export const CLOUD_TRANSITION_MS = 360;
export function cloudEase(elapsed, duration = CLOUD_TRANSITION_MS) {
  const t = Math.max(0, Math.min(1, elapsed / duration));
  return t * t * (3 - 2 * t);
}
export function cloudKey(frame) {
  const w = frame.waveform;
  return JSON.stringify([
    frame.source,
    frame.segment,
    frame.settings,
    w?.start ?? frame.start,
    w?.end ?? frame.end,
    frame.channels.map((c) => [c.name, c.valid, c.status]),
  ]);
}
export function cloudContext(frames, o) {
  const f = frames.at(-1);
  return JSON.stringify([
    o.mode,
    o.fluid,
    o.map,
    o.band,
    o.selected,
    o.scale,
    o.monochrome,
    o.cut,
    o.lens,
    f?.source,
    f?.segment,
    f?.settings,
    !!f?.mixed,
    !!f?.gaps,
    f?.channels.map((c) => [c.name, c.valid, c.status]),
  ]);
}
export function canBlendCloud(previous, frames, o, reduced = false) {
  return !!(
    previous &&
    frames.length &&
    ((o.mode === 'history' && o.fluid) || o.mode === 'constellation') &&
    o.animate &&
    !o.frozen &&
    !reduced &&
    o.total > previous.end &&
    o.total - previous.end < 3 &&
    previous.context === cloudContext(frames, o) &&
    !frames.at(-1).gaps &&
    !frames.at(-1).mixed
  );
}
