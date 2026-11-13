'use strict';
// Measurement utility, NOT a clinical pattern classifier.
function intervals(xs, name) {
 if (!Array.isArray(xs)) throw Error(`${name}: intervals required`);
 return xs.map((x,i)=>{if(!Array.isArray(x)||x.length!==2||!x.every(Number.isFinite)||x[0]<0||x[1]<=x[0])throw Error(`${name}[${i}]: invalid half-open interval`);return x.slice();}).sort((a,b)=>a[0]-b[0]);
}
function union(xs){const out=[];for(const [a,b] of xs){const last=out[out.length-1];if(last&&a<=last[1])last[1]=Math.max(b,last[1]);else out.push([a,b]);}return out;}
function length(xs){return xs.reduce((s,[a,b])=>s+b-a,0);}
function intersection(a,b){let i=0,j=0,out=[];while(i<a.length&&j<b.length){const lo=Math.max(a[i][0],b[j][0]),hi=Math.min(a[i][1],b[j][1]);if(hi>lo)out.push([lo,hi]);if(a[i][1]<b[j][1])i++;else j++;}return out;}
function equalMasks(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function measure({reviewed,patterns,mode='complete',populationId,neonatal=false}){
 if(!populationId||typeof populationId!=='string')throw Error('populationId required');
 if(!['complete','observed_estimate','unquantified_example'].includes(mode))throw Error('invalid measurement mode');
 const mask=union(intervals(reviewed,'reviewed'));
 const denominator=length(mask);
 if(!denominator)throw Error('no usable reviewed EEG');
 if(mode!=='complete')return {populationId,mode,usableReviewedSeconds:denominator,occupancyPercent:null,acnsPrevalence:null,reviewedMask:mask,reason:'Not a complete occupancy measurement'};
 if(neonatal)throw Error('neonatal ACNS prevalence categorization requires separate expert-reviewed protocol');
 const runs=union(intervals(patterns,'patterns'));
 const clipped=intersection(runs,mask);
 const seconds=length(clipped),pct=100*seconds/denominator;
 const category=pct===0?'absent':pct>=90?'continuous':pct>=50?'abundant':pct>=10?'frequent':pct>=1?'occasional':'rare';
 return {populationId,mode,usableReviewedSeconds:denominator,occupiedSeconds:seconds,occupancyPercent:pct,acnsPrevalence:category,reviewedMask:mask,occupiedMask:clipped};
}
function comparable(a,b,{waveform=false}={}){
 const fields=['montage','derivations','electrodes','samplingHz','highpassHz','lowpassHz','notchHz','reference'];
 for(const f of fields)if(a[f]===undefined||b[f]===undefined||JSON.stringify(a[f])!==JSON.stringify(b[f]))return {comparable:false,reason:`acquisition mismatch or missing: ${f}`};
 if(!equalMasks(union(intervals(a.reviewed,'a.reviewed')),union(intervals(b.reviewed,'b.reviewed'))))return {comparable:false,reason:'reviewed epoch masks differ'};
 return {comparable:true,reason:waveform?'waveform settings declared identical; verify channel mapping and raw files':'prevalence settings and reviewed masks declared identical'};
}
module.exports={measure,comparable,union,intersection};
