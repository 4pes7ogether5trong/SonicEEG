'use strict';
// Metadata-only sample clock guard. Does not prove waveform identity.
function validate(t){
 const r=[];
 if(!t||typeof t!=='object')return ['missing_timebase'];
 if(!Number.isFinite(t.sampleRateHz)||t.sampleRateHz<=0)r.push('invalid_sample_rate');
 if(!Number.isSafeInteger(t.firstSampleIndex)||t.firstSampleIndex<0)r.push('invalid_first_sample');
 if(!Number.isSafeInteger(t.sampleCount)||t.sampleCount<=0)r.push('invalid_sample_count');
 if(!Number.isFinite(t.clockOriginSeconds))r.push('invalid_clock_origin');
 if(typeof t.recordingId!=='string'||!t.recordingId.trim())r.push('invalid_recording_id');
 if(!r.length&&!Number.isSafeInteger(t.firstSampleIndex+t.sampleCount))r.push('sample_index_overflow');
 return r;
}
function compare(a,b){
 const reasons=[...validate(a).map(x=>'model_'+x),...validate(b).map(x=>'reference_'+x)];
 if(reasons.length)return {comparable:false,reasons};
 for(const k of ['recordingId','sampleRateHz','firstSampleIndex','sampleCount','clockOriginSeconds'])if(a[k]!==b[k])reasons.push(k+'_mismatch');
 return {comparable:reasons.length===0,reasons};
}
function sampleAt(t,seconds){
 const issues=validate(t);if(issues.length)throw Error(issues.join(','));
 if(!Number.isFinite(seconds)||seconds<0)throw RangeError('invalid_elapsed_time');
 const exact=seconds*t.sampleRateHz,index=Math.round(exact)+t.firstSampleIndex;
 if(Math.abs(exact-Math.round(exact))>0.500000001)throw RangeError('off_sample_grid');
 if(!Number.isSafeInteger(index)||index<t.firstSampleIndex||index>=t.firstSampleIndex+t.sampleCount)throw RangeError('outside_sample_window');
 return index;
}
function compareReviewedWindows(a,b,intervals){
 const c=compare(a,b);if(!c.comparable)return c;
 const reasons=[];
 if(!Array.isArray(intervals)||!intervals.length)return {comparable:false,reasons:['missing_intervals']};
 intervals.forEach((v,i)=>{
  if(!Array.isArray(v)||v.length!==2||!v.every(Number.isFinite)||v[0]<0||v[1]<=v[0]){reasons.push('invalid_interval_'+i);return;}
  try{sampleAt(a,v[0]);sampleAt(a,v[1]-1/a.sampleRateHz);}catch(e){reasons.push('unaligned_interval_'+i+':'+e.message);}
 });
 return {comparable:reasons.length===0,reasons};
}
module.exports={validate,compare,sampleAt,compareReviewedWindows};
