'use strict';
// Metadata-only accounting; clinical pattern identity must be confirmed separately.
const finite=x=>typeof x==='number'&&Number.isFinite(x);
function normalize(intervals){
 if(!Array.isArray(intervals))throw Error('intervals_not_array');
 const sorted=intervals.map(i=>{if(!i||!finite(i.startSeconds)||!finite(i.endSeconds)||i.startSeconds<0||i.endSeconds<=i.startSeconds)throw Error('invalid_interval');return [i.startSeconds,i.endSeconds]}).sort((a,b)=>a[0]-b[0]);
 const merged=[];for(const [s,e] of sorted){const last=merged[merged.length-1];if(last&&s<=last[1])last[1]=Math.max(last[1],e);else merged.push([s,e]);}return merged;
}
const duration=xs=>xs.reduce((a,[s,e])=>a+e-s,0);
function intersection(a,b){const out=[];let i=0,j=0;while(i<a.length&&j<b.length){const s=Math.max(a[i][0],b[j][0]),e=Math.min(a[i][1],b[j][1]);if(e>s)out.push([s,e]);if(a[i][1]<b[j][1])i++;else j++;}return out;}
function measurePattern({reviewedEpochs,usableEpochs,patternRuns,measurement='complete',ageContext='unknown'}){
 if(!['complete','observed-estimate','unquantified'].includes(measurement))throw Error('measurement_invalid');
 const reviewed=normalize(reviewedEpochs),usable=normalize(usableEpochs),runs=normalize(patternRuns);
 const mask=intersection(reviewed,usable),denominatorSeconds=duration(mask);
 if(!denominatorSeconds)throw Error('no_usable_reviewed_eeg');
 if(ageContext==='neonatal')return {status:'neonatal-specialist-review',measurement,denominatorSeconds,occupancyPercent:null,category:null};
 if(measurement==='unquantified')return {status:'unquantified',measurement,denominatorSeconds,occupancyPercent:null,category:null};
 const numeratorSeconds=duration(intersection(runs,mask));
 const percent=100*numeratorSeconds/denominatorSeconds;
 const category=measurement==='complete'?(numeratorSeconds===0?'absent':percent<1?'rare':percent<10?'occasional':percent<50?'frequent':percent<90?'abundant':'continuous'):null;
 return {status:measurement,measurement,denominatorSeconds,numeratorSeconds,occupancyPercent:percent,category};
}
function comparableMasks(a,b){const x=normalize(a),y=normalize(b);return x.length===y.length&&x.every((v,i)=>v[0]===y[i][0]&&v[1]===y[i][1]);}
module.exports={normalize,intersection,measurePattern,comparableMasks};
