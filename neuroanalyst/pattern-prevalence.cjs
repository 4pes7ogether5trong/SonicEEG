'use strict';
// Synthetic metadata only; clinical interpretation requires reviewer confirmation.
const CATEGORIES=[{max:1,name:'Rare'},{max:10,name:'Occasional'},{max:50,name:'Frequent'},{max:90,name:'Abundant'},{max:100,name:'Continuous'}];
function unionDuration(intervals){
 const sorted=intervals.map(x=>[x.start,x.end]).sort((a,b)=>a[0]-b[0]);let total=0,left=null,right=null;
 for(const [a,b] of sorted){if(!Number.isFinite(a)||!Number.isFinite(b)||a>=b)throw Error('invalid interval');
 if(left===null){left=a;right=b;continue;}if(a<=right)right=Math.max(right,b);else{total+=right-left;left=a;right=b;}}
 return left===null?0:total+right-left;
}
function occupancy({usableReviewed,runs,coverage='complete'}){
 if(!Array.isArray(usableReviewed)||!Array.isArray(runs))throw Error('interval arrays required');
 if(!['complete','observed-estimate','unquantified-example'].includes(coverage))throw Error('invalid coverage');
 const denominator=unionDuration(usableReviewed);if(!denominator)throw Error('no usable reviewed EEG');
 if(coverage==='unquantified-example')return {coverage,percent:null,category:null,usableSeconds:denominator};
 const intersections=[];
 for(const run of runs){if(!Number.isFinite(run.start)||!Number.isFinite(run.end)||run.start>=run.end)throw Error('invalid run');
 for(const reviewed of usableReviewed){const a=Math.max(run.start,reviewed.start),b=Math.min(run.end,reviewed.end);if(b>a)intersections.push({start:a,end:b});}}
 const occupied=unionDuration(intersections),percent=100*occupied/denominator;
 const category=occupied===0?null:CATEGORIES.find(c=>percent<c.max||(c.max===100&&percent<=100));
 return {coverage,percent,category:category?.name??null,occupiedSeconds:occupied,usableSeconds:denominator};
}
function sporadicRate({dischargeTimes,usableReviewed,coverage='complete'}){
 if(!Array.isArray(dischargeTimes))throw Error('times required');const duration=unionDuration(usableReviewed);if(!duration)throw Error('no usable reviewed EEG');
 if(coverage==='unquantified-example')return {coverage,ratePerMinute:null,count:null};
 if(!['complete','observed-estimate'].includes(coverage))throw Error('invalid coverage');
 const times=new Set();for(const t of dischargeTimes){if(!Number.isFinite(t))throw Error('invalid timestamp');if(usableReviewed.some(w=>t>=w.start&&t<w.end))times.add(t);}
 return {coverage,ratePerMinute:times.size/(duration/60),count:times.size,usableSeconds:duration};
}
module.exports={occupancy,sporadicRate,unionDuration};
