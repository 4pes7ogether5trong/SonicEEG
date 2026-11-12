'use strict';
// Synthetic annotation grouping; no waveform analysis or clinical inference.
const ALLOWED = new Set(['seizure','RDA','PD','BIRD','interictal_discharge','blink','vertex','k_complex','spindle','state_change']);
const ROUTINE = new Set(['blink','vertex','k_complex','spindle','state_change']);
function groupEpisodes(events, options = {}) {
  const {threshold = 0.9, gapSeconds = 10} = options;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1 || !Number.isFinite(gapSeconds) || gapSeconds < 0) throw Error('invalid options');
  if (!Array.isArray(events)) throw Error('events must be an array');
  const sorted = events.map((e, index) => {
    if (!e || !ALLOWED.has(e.kind) || !Number.isFinite(e.time) || e.time < 0 || !Number.isFinite(e.confidence) || e.confidence < 0 || e.confidence > 1 || (e.duration !== undefined && (!Number.isFinite(e.duration) || e.duration < 0))) throw Error('invalid event');
    if (e.evidenceId !== undefined && (typeof e.evidenceId !== 'string' || !e.evidenceId.trim())) throw Error('invalid evidenceId');
    return {...e, _index:index};
  }).sort((a,b) => a.time-b.time || a._index-b._index);
  const groups = [], firstRoutine = new Set();
  for (const e of sorted) {
    if (e.confidence < threshold) continue;
    if (ROUTINE.has(e.kind)) {
      if (firstRoutine.has(e.kind)) continue;
      firstRoutine.add(e.kind);
    }
    const end = e.time + (e.duration || 0);
    // Never merge seizure candidates: distinct onset/offset boundaries must remain visible.
    const previous = groups[groups.length-1];
    const canMerge = !ROUTINE.has(e.kind) && e.kind !== 'seizure' && previous && previous.kind === e.kind && e.time <= previous.end + gapSeconds;
    if (canMerge) {
      previous.end = Math.max(previous.end,end);
      previous.count++;
      previous.confidenceMin = Math.min(previous.confidenceMin,e.confidence);
      previous.confidenceMax = Math.max(previous.confidenceMax,e.confidence);
      if (e.evidenceId && !previous.evidenceIds.includes(e.evidenceId)) previous.evidenceIds.push(e.evidenceId);
    } else {
      groups.push({kind:e.kind,start:e.time,end,count:1,confidenceMin:e.confidence,confidenceMax:e.confidence,evidenceIds:e.evidenceId?[e.evidenceId]:[]});
    }
  }
  return groups;
}
module.exports = {groupEpisodes};
