'use strict';
// Research/evaluation utility. Not a clinical classifier or automatic ACNS grader.
function normalize(intervals, label) {
  if (!Array.isArray(intervals)) throw new TypeError(`${label} must be an array`);
  const sorted = intervals.map((v,i)=>{
    if (!Array.isArray(v)||v.length!==2||!v.every(Number.isFinite)||v[0]<0||v[1]<=v[0]) throw new RangeError(`${label}[${i}] invalid half-open interval`);
    return [v[0],v[1]];
  }).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const out=[];
  for(const [s,e] of sorted){const last=out[out.length-1];if(last&&s<=last[1])last[1]=Math.max(last[1],e);else out.push([s,e]);}
  return out;
}
function duration(intervals){return intervals.reduce((sum,[s,e])=>sum+e-s,0);}
function intersect(a,b){let i=0,j=0;const out=[];while(i<a.length&&j<b.length){const s=Math.max(a[i][0],b[j][0]),e=Math.min(a[i][1],b[j][1]);if(e>s)out.push([s,e]);if(a[i][1]<b[j][1])i++;else if(b[j][1]<a[i][1])j++;else{i++;j++;}}return out;}
function occupancy({reviewed,usable,patterns,patternId,measurement='complete',ageGroup,clinicalConfirmation=false}){
  if(typeof patternId!=='string'||!patternId.trim())throw new TypeError('patternId required');
  if(!['complete','observed_estimate','unquantified_example'].includes(measurement))throw new RangeError('invalid measurement');
  const r=normalize(reviewed,'reviewed'),u=normalize(usable,'usable');
  const mask=intersect(r,u), denominatorSeconds=duration(mask);
  if(!denominatorSeconds)throw new RangeError('no usable reviewed EEG');
  if(!Array.isArray(patterns))throw new TypeError('patterns must be an array');
  const selected=patterns.filter(p=>p&&p.patternId===patternId);
  for(const p of selected){if(!Number.isFinite(p.start)||!Number.isFinite(p.end)||p.start<0||p.end<=p.start)throw new RangeError('invalid pattern interval');}
  const runs=normalize(selected.map(p=>[p.start,p.end]),'pattern runs');
  const observed=intersect(runs,mask), occupiedSeconds=duration(observed);
  // An observed estimate may be displayed, but cannot masquerade as complete measurement.
  const quantifiable=measurement==='complete';
  return {patternId,ageGroup:ageGroup??'unknown',clinicalConfirmation,measurement,
    usableReviewedSeconds:denominatorSeconds,occupiedSeconds:measurement==='unquantified_example'?null:occupiedSeconds,
    occupancyPercent:measurement==='unquantified_example'?null:100*occupiedSeconds/denominatorSeconds,
    intervals:observed,acnsPrevalenceCategory:null,
    requiresExpertCategoryAssignment:true,
    completeMeasurement:quantifiable,
    note:'Pattern identity and ACNS prevalence category require qualified review; detector candidates are not confirmation.'};
}
module.exports={normalize,intersect,duration,occupancy};
