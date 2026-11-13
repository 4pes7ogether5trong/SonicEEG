'use strict';
const valid=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
function interval(x){return x&&valid(x.startSeconds)&&valid(x.endSeconds)&&x.endSeconds>x.startSeconds;}
function orderedSegments(segments){
 if(!Array.isArray(segments)||!segments.length)throw new TypeError('segments required');
 const sorted=[...segments].sort((a,b)=>a.startSeconds-b.startSeconds);
 for(let i=0;i<sorted.length;i++){
  const s=sorted[i];
  if(!interval(s)||!Number.isSafeInteger(s.firstSample)||s.firstSample<0||!Number.isSafeInteger(s.sampleCount)||s.sampleCount<=0||!valid(s.sampleRateHz)||s.sampleRateHz===0)throw new TypeError('invalid segment');
  if(Math.abs(s.endSeconds-s.startSeconds-s.sampleCount/s.sampleRateHz)>1e-6)throw new TypeError('sample duration mismatch');
  if(i&&sorted[i-1].endSeconds>s.startSeconds+1e-7)throw new TypeError('overlapping segments');
  if(i&&sorted[i-1].firstSample+sorted[i-1].sampleCount>s.firstSample)throw new TypeError('overlapping samples');
 }
 return sorted;
}
function coverage(startSeconds,endSeconds,segments){
 if(!valid(startSeconds)||!valid(endSeconds)||endSeconds<=startSeconds)throw new TypeError('invalid episode');
 const ss=orderedSegments(segments);let cursor=startSeconds;
 for(const s of ss){
  if(s.endSeconds<=cursor+1e-7)continue;
  if(s.startSeconds>cursor+1e-7)break;
  cursor=Math.min(endSeconds,s.endSeconds);
  if(cursor>=endSeconds-1e-7)return true;
 }
 return false;
}
function continuityDecision(episode,segments,qualityIntervals,postArtifact){
 const reasons=[];
 if(!episode||!valid(episode.startSeconds)||!valid(episode.endSeconds)||episode.endSeconds<=episode.startSeconds)throw new TypeError('invalid episode');
 if(!coverage(episode.startSeconds,episode.endSeconds,segments))reasons.push('recording_discontinuity');
 if(!Array.isArray(qualityIntervals)||!qualityIntervals.length)reasons.push('quality_unverified');
 else {
  let cursor=episode.startSeconds;
  for(const q of [...qualityIntervals].sort((a,b)=>a.startSeconds-b.startSeconds)){
   if(!interval(q)||q.startSeconds<cursor-1e-7||q.startSeconds>cursor+1e-7||q.endSeconds>episode.endSeconds+1e-7){reasons.push('quality_mask_invalid');break;}
   if(q.quality!=='usable')reasons.push('artifact_or_uncertain');
   cursor=q.endSeconds;
  }
  if(Math.abs(cursor-episode.endSeconds)>1e-7)reasons.push('quality_mask_incomplete');
 }
 if(reasons.includes('artifact_or_uncertain')){
  if(!postArtifact||postArtifact.reviewed!==true||!valid(postArtifact.startSeconds)||!valid(postArtifact.endSeconds)||postArtifact.endSeconds<=postArtifact.startSeconds||postArtifact.startSeconds<episode.endSeconds-1e-7||!coverage(postArtifact.startSeconds,postArtifact.endSeconds,segments))reasons.push('post_artifact_continuity_unverified');
 }
 return {exportEligible:reasons.length===0,reasons:[...new Set(reasons)],boundaryStatus:reasons.length?'requires_human_review':'metadata_coverage_verified'};
}
module.exports={orderedSegments,coverage,continuityDecision};
