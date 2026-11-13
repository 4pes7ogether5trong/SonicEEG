'use strict';
// Synthetic metadata-only evidence resolution. Review coverage and representative excerpts are separate.
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const EPS=1e-7;
function exactCoverage(intervals,start,end){
 if(!finite(start)||!finite(end)||start<0||end<=start||!Array.isArray(intervals)||!intervals.length)return false;
 let cursor=start;
 for(const q of [...intervals].sort((a,b)=>a.startSeconds-b.startSeconds)){
  if(!q||!finite(q.startSeconds)||!finite(q.endSeconds)||q.endSeconds<=q.startSeconds||q.quality!=='usable'||Math.abs(q.startSeconds-cursor)>EPS||q.endSeconds>end+EPS)return false;
  cursor=q.endSeconds;
 }
 return Math.abs(cursor-end)<=EPS;
}
function assessSparseEvidence(episode,manifest){
 const reasons=[];
 if(!episode||!manifest||!Array.isArray(manifest.traces)||!manifest.recordingId||!manifest.montageId)return ['manifest_missing'];
 if(episode.recordingId!==manifest.recordingId||episode.montageId!==manifest.montageId)reasons.push('recording_or_montage_mismatch');
 if(!exactCoverage(episode.qualityIntervals,episode.startSeconds,episode.endSeconds))reasons.push('review_coverage_incomplete');
 if(!Array.isArray(episode.evidenceIds)||!episode.evidenceIds.length||new Set(episode.evidenceIds).size!==episode.evidenceIds.length)reasons.push('evidence_ids_invalid');
 const traces=new Map();
 for(const t of manifest.traces){
  if(!t||typeof t.id!=='string'||!t.id||traces.has(t.id))reasons.push('manifest_trace_id_invalid');
  else traces.set(t.id,t);
 }
 for(const id of Array.isArray(episode.evidenceIds)?episode.evidenceIds:[]){
  const t=traces.get(id);
  if(!t){reasons.push('evidence_unresolved');continue;}
  if(t.recordingId!==manifest.recordingId||t.montageId!==manifest.montageId||!finite(t.startSeconds)||!finite(t.endSeconds)||t.startSeconds<episode.startSeconds-EPS||t.endSeconds>episode.endSeconds+EPS||t.endSeconds<=t.startSeconds)reasons.push('evidence_scope_invalid');
  if(!Array.isArray(t.channels)||!Array.isArray(episode.channels)||episode.channels.some(c=>!t.channels.includes(c)))reasons.push('evidence_channels_mismatch');
 }
 return [...new Set(reasons)];
}
function gateSparseEpisode(episode,manifest,prepareEpisodeReview){
 if(typeof prepareEpisodeReview!=='function')throw new TypeError('review function required');
 const base=prepareEpisodeReview([episode])[0];
 const reasons=[...new Set([...base.reasons,...assessSparseEvidence(episode,manifest)])];
 return {...base,exportEligible:base.exportEligible&&reasons.length===0,requiresReview:!base.exportEligible||reasons.length>0,reasons};
}
module.exports={exactCoverage,assessSparseEvidence,gateSparseEpisode};
