'use strict';
// Synthetic event postprocessing only; no EEG interpretation or clinical validation.
const KINDS = new Set(['seizure','RDA','PD','BIRD','interictal_discharge','blink','vertex','k_complex','spindle','state_change']);
const ROUTINE = new Set(['blink','vertex','k_complex','spindle','state_change']);
function groupEpisodesV2(events, {threshold=0.9,gapSeconds=10}={}) {
  if (!Array.isArray(events)) throw new TypeError('events must be an array');
  if (!Number.isFinite(threshold)||threshold<0||threshold>1||!Number.isFinite(gapSeconds)||gapSeconds<0) throw new RangeError('invalid options');
  const sorted=events.map((e,i)=>{
    if(!e||!KINDS.has(e.kind)||!Number.isFinite(e.time)||e.time<0||!Number.isFinite(e.confidence)||e.confidence<0||e.confidence>1||!Number.isFinite(e.duration??0)||(e.duration??0)<0) throw new TypeError('invalid event');
    if(e.evidenceId!==undefined&&(typeof e.evidenceId!=='string'||!e.evidenceId.trim())) throw new TypeError('invalid evidenceId');
    return {...e,_i:i,end:e.time+(e.duration??0)};
  }).sort((a,b)=>a.time-b.time||a._i-b._i);
  const result=[], routineSeen=new Set();
  // Seizure candidates reset grouping; do not consolidate across their onset.
  const active=new Map();
  for(const e of sorted){
    if(e.confidence<threshold) continue;
    if(e.kind==='seizure') {
      active.clear();
      result.push({kind:e.kind,start:e.time,end:e.end,count:1,confidenceMin:e.confidence,confidenceMax:e.confidence,evidenceIds:e.evidenceId?[e.evidenceId]:[],reviewRequired:true});
      continue;
    }
    if(ROUTINE.has(e.kind)) {
      if(routineSeen.has(e.kind)) continue;
      routineSeen.add(e.kind);
    }
    const prev=active.get(e.kind);
    if(!ROUTINE.has(e.kind)&&prev&&e.time<=prev.end+gapSeconds){
      prev.end=Math.max(prev.end,e.end); prev.count++;
      prev.confidenceMin=Math.min(prev.confidenceMin,e.confidence);
      prev.confidenceMax=Math.max(prev.confidenceMax,e.confidence);
      if(e.evidenceId&&!prev.evidenceIds.includes(e.evidenceId))prev.evidenceIds.push(e.evidenceId);
    }else{
      const episode={kind:e.kind,start:e.time,end:e.end,count:1,confidenceMin:e.confidence,confidenceMax:e.confidence,evidenceIds:e.evidenceId?[e.evidenceId]:[],reviewRequired:e.kind==='BIRD'};
      result.push(episode);
      if(!ROUTINE.has(e.kind))active.set(e.kind,episode);
    }
  }
  return result.sort((a,b)=>a.start-b.start);
}
module.exports={groupEpisodesV2};
