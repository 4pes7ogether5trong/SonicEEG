'use strict';
// Fail-closed metadata comparability guard. No waveform inference.
function validNumber(x){return typeof x==='number'&&Number.isFinite(x)&&x>0;}
function validateAcquisition(a){
 const issues=[];
 if(!a||typeof a!=='object')return ['missing_acquisition'];
 if(!validNumber(a.sampleRateHz))issues.push('invalid_sample_rate');
 for(const k of ['highPassHz','lowPassHz','notchHz'])if(a[k]!==null&&a[k]!==undefined&&(!validNumber(a[k])))issues.push('invalid_'+k);
 if(a.highPassHz!=null&&a.lowPassHz!=null&&a.highPassHz>=a.lowPassHz)issues.push('invalid_filter_band');
 if(!Number.isFinite(a.clockOriginSeconds))issues.push('missing_clock_origin');
 if(typeof a.recordingId!=='string'||!a.recordingId.trim())issues.push('missing_recording_id');
 if(typeof a.units!=='string'||!['uV','mV','V'].includes(a.units))issues.push('invalid_units');
 if(typeof a.referenceMode!=='string'||!a.referenceMode.trim())issues.push('missing_reference_mode');
 return issues;
}
function compareAcquisitions(a,b){
 const issues=[...validateAcquisition(a).map(x=>'model_'+x),...validateAcquisition(b).map(x=>'reference_'+x)];
 if(issues.length)return {comparable:false,reasons:issues};
 const keys=['recordingId','sampleRateHz','highPassHz','lowPassHz','notchHz','units','referenceMode'];
 for(const k of keys)if((a[k]??null)!==(b[k]??null))issues.push(k+'_mismatch');
 if(a.clockOriginSeconds!==b.clockOriginSeconds)issues.push('clock_origin_mismatch');
 return {comparable:issues.length===0,reasons:issues};
}
function compareEvaluationContexts(model,reference){
 const acquisition=compareAcquisitions(model?.acquisition,reference?.acquisition);
 const reasons=[...acquisition.reasons];
 const a=model?.reviewedIntervals,b=reference?.reviewedIntervals;
 if(!Array.isArray(a)||!Array.isArray(b))reasons.push('missing_reviewed_intervals');
 else {
  const norm=xs=>{if(xs.some(v=>!Array.isArray(v)||v.length!==2||!v.every(Number.isFinite)||v[0]<0||v[1]<=v[0]))throw Error('invalid intervals');const out=[];for(const [s,e] of [...xs].sort((x,y)=>x[0]-y[0])){const z=out[out.length-1];if(z&&s<=z[1])z[1]=Math.max(z[1],e);else out.push([s,e]);}return out;};
  try{if(JSON.stringify(norm(a))!==JSON.stringify(norm(b)))reasons.push('reviewed_mask_mismatch');}catch{reasons.push('invalid_reviewed_intervals');}
 }
 return {comparable:reasons.length===0,reasons};
}
module.exports={validateAcquisition,compareAcquisitions,compareEvaluationContexts};
