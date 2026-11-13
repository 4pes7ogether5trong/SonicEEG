'use strict';
const {prepareEpisodeReview}=require('./episode-review.cjs');
const {gateSparseEpisode}=require('./sparse-evidence-gate.cjs');
const finite=x=>typeof x==='number'&&Number.isFinite(x);
function validateContext(e,m){
 const reasons=[];if(!m||!Array.isArray(m.baselines))return ['baseline_manifest_missing'];
 const refs=new Map();
 for(const b of m.baselines){if(!b||typeof b.id!=='string'||!b.id||refs.has(b.id)){reasons.push('baseline_ids_invalid');continue;}refs.set(b.id,b);}
 const b=refs.get(e?.baseline?.sameStateReferenceId);
 if(!b)return [...new Set([...reasons,'baseline_unresolved'])];
 if(b.recordingId!==e.recordingId||b.montageId!==e.montageId)reasons.push('baseline_scope_mismatch');
 if(!finite(b.startSeconds)||!finite(b.endSeconds)||b.startSeconds<0||b.endSeconds<=b.startSeconds||b.endSeconds>e.startSeconds)reasons.push('baseline_time_invalid');
 if(!b.state||!e.state||b.state!==e.state)reasons.push('baseline_state_mismatch');
 if(!Array.isArray(b.channels)||!Array.isArray(e.channels)||e.channels.some(c=>!b.channels.includes(c)))reasons.push('baseline_channels_mismatch');
 if(!Array.isArray(e?.baseline?.priorEventComparisonIds))reasons.push('prior_events_invalid');
 else for(const id of e.baseline.priorEventComparisonIds){const p=(m.priorEvents||[]).find(x=>x?.id===id);if(!p||p.recordingId!==e.recordingId||!finite(p.endSeconds)||p.endSeconds>e.startSeconds)reasons.push('prior_event_unresolved_or_future');}
 return [...new Set(reasons)];
}
function buildSyntheticReport(episodes,manifest,{enabled=false}={}){
 if(!Array.isArray(episodes))throw new TypeError('episodes must be array');
 const duplicates=new Set(),seen=new Set();
 for(const e of episodes){if(e&&seen.has(e.id))duplicates.add(e.id);if(e)seen.add(e.id);}
 return {kind:'synthetic-technician-review',clinicalUse:false,featureEnabled:enabled,findings:episodes.map(e=>{
 const gate=gateSparseEpisode(e,manifest,prepareEpisodeReview);
 const reasons=[...new Set([...gate.reasons,...validateContext(e,manifest),...(duplicates.has(e?.id)?['duplicate_episode_id']:[])])];
 const eligible=enabled&&gate.exportEligible&&reasons.length===0;
 return {episodeId:e?.id??null,classification:e?.classification??null,status:eligible?'ready-for-technician-verification':'withheld',reasons:enabled?reasons:[...reasons,'feature_disabled'],evidenceIds:eligible?[...e.evidenceIds]:[],representativeTraceOnly:true};
 })};
}
module.exports={validateContext,buildSyntheticReport};
