'use strict';
// Fail-closed metadata-only evidence gate. Does not infer EEG diagnosis.
const finite = x => typeof x === 'number' && Number.isFinite(x);
const EPS = 1e-7;
function cover(intervals, start, end) {
  if (!finite(start) || !finite(end) || start < 0 || end <= start || !Array.isArray(intervals)) return false;
  const sorted = intervals.map(x => ({...x})).sort((a,b) => a.startSeconds-b.startSeconds);
  let cursor = start;
  for (const x of sorted) {
    if (!finite(x.startSeconds) || !finite(x.endSeconds) || x.endSeconds <= x.startSeconds || x.startSeconds < start-EPS || x.endSeconds > end+EPS || x.startSeconds > cursor+EPS || x.startSeconds < cursor-EPS || x.quality !== 'usable') return false;
    cursor = x.endSeconds;
  }
  return Math.abs(cursor-end) <= EPS;
}
function resolveEvidence(episode, manifest) {
  const reasons = [];
  if (!episode || !manifest || !Array.isArray(manifest.traces) || !manifest.recordingId || !manifest.montageId) return ['manifest_missing'];
  if (episode.recordingId !== manifest.recordingId || episode.montageId !== manifest.montageId) reasons.push('recording_or_montage_mismatch');
  if (!cover(episode.qualityIntervals, episode.startSeconds, episode.endSeconds)) reasons.push('quality_coverage_incomplete');
  const ids = episode.evidenceIds;
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) reasons.push('evidence_ids_invalid');
  const traceMap = new Map();
  for (const t of manifest.traces) {
    if (!t || typeof t.id !== 'string' || !t.id || traceMap.has(t.id)) reasons.push('manifest_trace_id_invalid');
    else traceMap.set(t.id,t);
  }
  for (const id of Array.isArray(ids) ? ids : []) {
    const t = traceMap.get(id);
    if (!t) { reasons.push('evidence_unresolved'); continue; }
    if (t.recordingId !== manifest.recordingId || t.montageId !== manifest.montageId || !finite(t.startSeconds) || !finite(t.endSeconds) || t.startSeconds < 0 || t.endSeconds <= t.startSeconds || t.startSeconds > episode.startSeconds+EPS || t.endSeconds < episode.endSeconds-EPS) reasons.push('evidence_scope_invalid');
    if (!Array.isArray(t.channels) || !Array.isArray(episode.channels) || episode.channels.some(c=>!t.channels.includes(c))) reasons.push('evidence_channels_mismatch');
  }
  if (!manifest.traces.some(t=>Array.isArray(ids)&&ids.includes(t.id))) reasons.push('representative_trace_missing');
  return [...new Set(reasons)];
}
function gateEpisodeExport(episode, manifest, prepareEpisodeReview) {
  const original = prepareEpisodeReview([episode])[0];
  const reasons = [...new Set([...original.reasons, ...resolveEvidence(episode,manifest)])];
  const eligible = original.exportEligible && reasons.length === 0;
  return {...original, exportEligible:eligible, requiresReview:!eligible, reasons};
}
module.exports = {cover,resolveEvidence,gateEpisodeExport};
