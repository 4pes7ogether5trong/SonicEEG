'use strict';
const TOLERANCE_SECONDS=3;
function finite(t){return typeof t==='number'&&Number.isFinite(t)&&t>=0;}
function evaluateOffsets(events,{toleranceSeconds=TOLERANCE_SECONDS}={}){
 if(!Array.isArray(events)||!finite(toleranceSeconds))throw Error('invalid events or tolerance');
 const seen=new Set(),results=[];let matched=0,agreed=0,missed=0,unscored=0;
 for(const e of events){
  if(!e||typeof e.id!=='string'||!e.id||seen.has(e.id))throw Error('missing or duplicate event id');seen.add(e.id);
  if(e.matched===false){missed++;results.push({id:e.id,status:'missed',referenceType:e.reference?.type??null});continue;}
  if(e.matched!==true){unscored++;results.push({id:e.id,status:'unscored',reason:'match-status-unknown'});continue;}
  matched++;
  const ref=e.reference;
  if(!ref||!['published-point','reviewer-point','plausible-range','indeterminate'].includes(ref.type))throw Error('explicit reference provenance required');
  if(ref.type==='indeterminate'||ref.type==='plausible-range'){unscored++;results.push({id:e.id,status:'unscored',reason:ref.type,referenceType:ref.type});continue;}
  if(!finite(ref.elapsedSeconds)||!finite(e.predictedOffsetSeconds)){unscored++;results.push({id:e.id,status:'unscored',reason:'missing-point-offset',referenceType:ref.type});continue;}
  const signedDifferenceSeconds=e.predictedOffsetSeconds-ref.elapsedSeconds;
  const withinTolerance=Math.abs(signedDifferenceSeconds)<=toleranceSeconds+1e-9;
  if(withinTolerance)agreed++;
  results.push({id:e.id,status:withinTolerance?'agree':'disagree',referenceType:ref.type,referenceElapsedSeconds:ref.elapsedSeconds,predictedElapsedSeconds:e.predictedOffsetSeconds,signedDifferenceSeconds,withinTolerance});
 }
 const scored=results.filter(r=>r.status==='agree'||r.status==='disagree').length;
 return {toleranceSeconds,matchedSeizures:matched,scoredMatchedSeizures:scored,agreementCount:agreed,agreementDenominator:scored,agreementRate:scored?agreed/scored:null,missedSeizures:missed,unscoredEvents:unscored,results};
}
const SIENA_PN13_2_EVENT_A_REVIEW={recording:'Siena PN13-2.edf',event:'A',reference:{type:'reviewer-point',elapsedSeconds:7316},heldOut:true};
module.exports={TOLERANCE_SECONDS,evaluateOffsets,SIENA_PN13_2_EVENT_A_REVIEW};
