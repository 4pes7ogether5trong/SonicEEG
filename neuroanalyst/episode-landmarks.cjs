'use strict';
// Synthetic metadata triage only; no electrographic diagnosis.
const finite=x=>typeof x==='number'&&Number.isFinite(x);
function triageEpisode({onset,offset,landmarks,qualityGaps=[],baselineState}={}){
 if(!finite(onset)||!finite(offset)||offset<=onset||!Array.isArray(landmarks))throw Error('invalid episode');
 const ids=new Set(), flags=[], active=new Map(), transitions=[];
 for(const g of qualityGaps){if(!Array.isArray(g)||g.length!==2||!finite(g[0])||!finite(g[1])||g[1]<=g[0])throw Error('invalid gap')}
 for(const l of [...landmarks].sort((a,b)=>a.time-b.time)){
  if(!l||!finite(l.time)||l.time<onset||l.time>offset||typeof l.id!=='string'||!l.id||ids.has(l.id))throw Error('invalid landmark');
  ids.add(l.id);
  if(typeof l.patternId!=='string'||!l.patternId||!['onset','change','offset','baseline-return','artifact','state-change'].includes(l.kind))throw Error('invalid landmark kind');
  const obscured=qualityGaps.some(([a,b])=>l.time>=a&&l.time<=b);
  if(obscured)flags.push({id:l.id,reason:'quality-gap'});
  if(l.kind==='onset'){
   if(active.has(l.patternId))flags.push({id:l.id,reason:'duplicate-onset'});
   else active.set(l.patternId,{time:l.time,field:l.field||null});
  }
  if(l.kind==='offset'){
   if(!active.has(l.patternId))flags.push({id:l.id,reason:'orphan-offset'});
   else active.delete(l.patternId);
  }
  if(l.kind==='baseline-return'&&active.has(l.patternId))flags.push({id:l.id,reason:'baseline-return-before-pattern-offset'});
  if(l.kind==='state-change'&&baselineState==null)flags.push({id:l.id,reason:'missing-state-baseline'});
  transitions.push({id:l.id,time:l.time,patternId:l.patternId,kind:l.kind,field:l.field||null,obscured});
 }
 for(const [patternId] of active)flags.push({patternId,reason:'unresolved-pattern-offset'});
 for(const [a,b] of qualityGaps)if(a<offset&&b>onset){
  const continuation=transitions.some(t=>t.time>b&&t.time<=offset&&!t.obscured&&t.kind!=='artifact');
  if(!continuation)flags.push({reason:'no-post-artifact-followthrough',gap:[a,b]});
 }
 return {transitions,flags,requiresReview:flags.length>0,unresolvedPatternIds:[...active.keys()]};
}
module.exports={triageEpisode};
