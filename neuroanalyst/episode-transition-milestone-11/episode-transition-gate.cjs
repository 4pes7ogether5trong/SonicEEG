'use strict';
// Research-only event bookkeeping. Landmarks are not diagnostic interpretations.
const TYPES=new Set(['change','seizure_onset','seizure_offset','pattern_onset','pattern_offset','spread','independent_onset','postictal_slowing','state_change','return_to_baseline','artifact_uncertain']);
function finite(t){return typeof t==='number'&&Number.isFinite(t)&&t>=0;}
function buildEpisodeTimeline({recordingId, landmarks, reviewMask, patterns, reviewerVerified=false}){
 if(typeof recordingId!=='string'||!recordingId.trim())throw new TypeError('recordingId required');
 if(!Array.isArray(reviewMask)||!Array.isArray(landmarks)||!Array.isArray(patterns))throw new TypeError('arrays required');
 const {normalize}=require('./reviewed-prevalence.cjs');
 const mask=normalize(reviewMask,'reviewMask');
 const inReview=t=>mask.some(([s,e])=>s<=t&&t<e);
 const ids=new Set();
 const events=landmarks.map((l,i)=>{
  if(!l||typeof l.id!=='string'||!l.id||ids.has(l.id))throw new Error('unique landmark id required');ids.add(l.id);
  if(!TYPES.has(l.type)||!finite(l.time)||typeof l.field!=='string'||!l.field.trim())throw new Error(`invalid landmark ${i}`);
  if(l.patternId!=null&&!patterns.some(p=>p.id===l.patternId))throw new Error('unknown pattern ID');
  if(l.evidence==null||typeof l.evidence.recordingId!=='string'||l.evidence.recordingId!==recordingId||!finite(l.evidence.time))throw new Error('recording-matched evidence required');
  if(l.interpretation!=null&&!['candidate','reviewer_confirmed','indeterminate'].includes(l.interpretation))throw new Error('invalid interpretation status');
  if(l.interpretation==='reviewer_confirmed'&&!reviewerVerified)throw new Error('reviewer verification required');
  return {...l,withinReviewedEpoch:inReview(l.time),interpretation:l.interpretation??'candidate'};
 }).sort((a,b)=>a.time-b.time||a.id.localeCompare(b.id));
 const pids=new Set();
 const populations=patterns.map(p=>{
  if(!p||typeof p.id!=='string'||!p.id||pids.has(p.id))throw new Error('unique pattern ID required');pids.add(p.id);
  if(!finite(p.onset)||!finite(p.offset)||p.offset<=p.onset||typeof p.field!=='string'||!p.field.trim())throw new Error('invalid pattern boundaries');
  if(!['seizure','RDA','PD','BIRDs','interictal','IIC_candidate','mimic','unknown'].includes(p.kind))throw new Error('invalid pattern kind');
  if(p.kind==='IIC_candidate'&&p.ageGroup==='neonatal')throw new Error('adult IIC rules prohibited for neonatal');
  return {...p,reviewerVerified:reviewerVerified&&p.reviewerVerified===true};
 });
 return {recordingId,reviewMask:mask,landmarks:events,patterns:populations,requiresHumanVerification:true,deliveryAuthorized:false};
}
module.exports={buildEpisodeTimeline};
