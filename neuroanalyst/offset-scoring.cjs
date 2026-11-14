'use strict';
// Evaluation only. Event IDs must be independently matched, never inferred from offset proximity.
const TOLERANCE_SECONDS=3;
function validTime(t){return typeof t==='number'&&Number.isFinite(t)&&t>=0;}
function scoreOffsets({references,predictions,toleranceSeconds=3}){
 if(!Array.isArray(references)||!Array.isArray(predictions)||!validTime(toleranceSeconds))throw Error('invalid inputs');
 for(const [name,items] of [['reference',references],['prediction',predictions]]){
  const seen=new Set();for(const e of items){if(!e||typeof e.eventId!=='string'||!e.eventId||seen.has(e.eventId)||typeof e.patientId!=='string'||!e.patientId||typeof e.recordingId!=='string'||!e.recordingId)throw Error('invalid or duplicate '+name);seen.add(e.eventId);}
 }
 const refMap=new Map(references.map(r=>[r.eventId,r])),predMap=new Map(predictions.map(p=>[p.eventId,p]));
 for(const r of references){
  if(!['published','reviewer_point','reviewer_range','indeterminate'].includes(r.referenceKind))throw Error('reference provenance required');
  if(['published','reviewer_point'].includes(r.referenceKind)&&!validTime(r.offsetSeconds))throw Error('invalid point reference');
  if(r.referenceKind==='reviewer_range'&&(!validTime(r.offsetStartSeconds)||!validTime(r.offsetEndSeconds)||r.offsetEndSeconds<r.offsetStartSeconds))throw Error('invalid range');
 }
 for(const p of predictions){if(!['point','abstain'].includes(p.status)||(p.status==='point'&&!validTime(p.offsetSeconds)))throw Error('invalid prediction');const r=refMap.get(p.eventId);if(r&&(r.patientId!==p.patientId||r.recordingId!==p.recordingId))throw Error('patient/recording mismatch');}
 const matched=[],missed=[],unresolved=[],unmatchedPredictions=predictions.filter(p=>!refMap.has(p.eventId));
 for(const r of references){
  const p=predMap.get(r.eventId);
  if(!p){missed.push({eventId:r.eventId,reason:'no_prediction'});continue;}
  if(p.status==='abstain'){unresolved.push({eventId:r.eventId,reason:'model_abstained'});continue;}
  if(!['published','reviewer_point'].includes(r.referenceKind)){unresolved.push({eventId:r.eventId,reason:'non_point_reference',referenceKind:r.referenceKind});continue;}
  const signedSeconds=p.offsetSeconds-r.offsetSeconds;
  matched.push({eventId:r.eventId,patientId:r.patientId,recordingId:r.recordingId,referenceKind:r.referenceKind,referenceSeconds:r.offsetSeconds,predictedSeconds:p.offsetSeconds,signedSeconds,withinTolerance:Math.abs(signedSeconds)<=toleranceSeconds});
 }
 const agreed=matched.filter(m=>m.withinTolerance).length;
 return {toleranceSeconds,matched,missed,unresolved,unmatchedPredictions,agreement:{numerator:agreed,denominator:matched.length,proportion:matched.length?agreed/matched.length:null},counts:{referenceEvents:references.length,matched:matched.length,missed:missed.length,abstained:unresolved.filter(x=>x.reason==='model_abstained').length,nonPointReferences:unresolved.filter(x=>x.reason==='non_point_reference').length,unmatchedPredictions:unmatchedPredictions.length}};
}
module.exports={scoreOffsets,TOLERANCE_SECONDS};
