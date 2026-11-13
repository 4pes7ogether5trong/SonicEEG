'use strict';
const WINDOW_SECONDS=1200;
const GROUPS=['neonatal','under-1','1-2','3-6','7-13','14-18','19-30','31-60','61+'];
function groupFromYears(y,neonatal=false){
 if(neonatal)return 'neonatal';
 if(!Number.isInteger(y)||y<0)return 'unknown';
 if(y===0)return 'under-1';
 for(const [lo,hi,name] of [[1,2,'1-2'],[3,6,'3-6'],[7,13,'7-13'],[14,18,'14-18'],[19,30,'19-30'],[31,60,'31-60'],[61,Infinity,'61+']])if(y>=lo&&y<=hi)return name;
 return 'unknown';
}
function normalize(intervals){
 if(!Array.isArray(intervals)||intervals.some(v=>!Array.isArray(v)||v.length!==2||v.some(n=>!Number.isFinite(n))||v[0]<0||v[1]<=v[0]))throw Error('invalid reviewed intervals');
 const out=[];for(const v of intervals.map(x=>[...x]).sort((a,b)=>a[0]-b[0])){const last=out[out.length-1];if(last&&v[0]<=last[1])last[1]=Math.max(last[1],v[1]);else out.push(v);}return out;
}
function seconds(xs){return xs.reduce((n,[a,b])=>n+b-a,0);}
function montageKey(m){
 if(!m||!Array.isArray(m.derivations)||!m.derivations.length||m.derivations.some(s=>typeof s!=='string'||!s.trim()))throw Error('montage derivations required');
 return JSON.stringify({derivations:m.derivations,reference:m.reference??null,electrodes:[...(m.electrodes||[])].sort()});
}
function compareCohorts(a,b){
 let x,y;try{x=normalize(a.reviewedIntervals);y=normalize(b.reviewedIntervals);}catch{return {comparable:false,reasons:['invalid_reviewed_intervals']};}
 const reasons=[];
 if(JSON.stringify(x)!==JSON.stringify(y))reasons.push('reviewed_epoch_mask_mismatch');
 if(seconds(x)!==WINDOW_SECONDS||seconds(y)!==WINDOW_SECONDS)reasons.push('not_standard_20_minute_window');
 try{if(montageKey(a.montage)!==montageKey(b.montage))reasons.push('montage_mismatch');}catch{reasons.push('montage_unspecified');}
 if(a.ageGroup!==b.ageGroup)reasons.push('age_group_mismatch');
 if(!GROUPS.includes(a.ageGroup))reasons.push('unknown_age_group');
 return {comparable:reasons.length===0,reasons,reviewedSecondsA:seconds(x),reviewedSecondsB:seconds(y)};
}
module.exports={WINDOW_SECONDS,GROUPS,groupFromYears,normalize,seconds,montageKey,compareCohorts};
