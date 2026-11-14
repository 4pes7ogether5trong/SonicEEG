'use strict';
// Engineering admission only; not clinical validation.
const finite=x=>typeof x==='number'&&Number.isFinite(x);
function mask(intervals){
 if(!Array.isArray(intervals)||!intervals.length)throw Error('review mask required');
 const sorted=intervals.map(v=>{if(!Array.isArray(v)||v.length!==2||!finite(v[0])||!finite(v[1])||v[0]<0||v[1]<=v[0])throw Error('invalid interval');return [...v]}).sort((a,b)=>a[0]-b[0]);
 const result=[];for(const [s,e] of sorted){const last=result.at(-1);if(last&&s<=last[1])last[1]=Math.max(last[1],e);else result.push([s,e])}return result;
}
function seconds(intervals){return mask(intervals).reduce((n,[s,e])=>n+e-s,0)}
function intersect(a,b){const out=[];let i=0,j=0;while(i<a.length&&j<b.length){const s=Math.max(a[i][0],b[j][0]),e=Math.min(a[i][1],b[j][1]);if(e>s)out.push([s,e]);if(a[i][1]<b[j][1])i++;else j++}return out}
function acquisition(m){
 if(!m||!Array.isArray(m.derivations)||!m.derivations.length)throw Error('derivations required');
 for(const k of ['sampleHz','highPassHz','lowPassHz','notchHz','reference','electrodes'])if(!(k in m))throw Error('missing '+k);
 if(!finite(m.sampleHz)||m.sampleHz<=0||!finite(m.highPassHz)||m.highPassHz<0||!finite(m.lowPassHz)||m.lowPassHz<=m.highPassHz||m.lowPassHz>m.sampleHz/2||(m.notchHz!==null&&(!finite(m.notchHz)||m.notchHz<=0||m.notchHz>=m.sampleHz/2)))throw Error('invalid filters');
 if(typeof m.reference!=='string'||!m.reference.trim()||!Array.isArray(m.electrodes)||!m.electrodes.length||m.electrodes.some(e=>typeof e!=='string'||!e.trim())||new Set(m.electrodes).size!==m.electrodes.length)throw Error('invalid electrodes/reference');
 const derivations=m.derivations.map(d=>{if(!Array.isArray(d)||d.length!==2||d[0]===d[1]||d.some(e=>!m.electrodes.includes(e)))throw Error('invalid derivation');return d.join(' - ')});
 if(new Set(derivations).size!==derivations.length)throw Error('duplicate derivation');
 return {...m,electrodes:[...m.electrodes].sort(),derivations:derivations.sort()};
}
function compare(a,b,{prevalence=false}={}){
 const reasons=[],warnings=[];let x,y,am,bm;
 try{x=acquisition(a.acquisition);y=acquisition(b.acquisition)}catch(e){reasons.push(e.message)}
 if(x&&y)for(const k of ['sampleHz','highPassHz','lowPassHz','notchHz','reference','electrodes','derivations'])if(JSON.stringify(x[k])!==JSON.stringify(y[k]))reasons.push('acquisition mismatch: '+k);
 try{am=mask(a.reviewedMask);bm=mask(b.reviewedMask)}catch(e){reasons.push(e.message)}
 const as=am?seconds(am):null,bs=bm?seconds(bm):null,common=am&&bm?intersect(am,bm):[],commonSeconds=common.reduce((n,[s,e])=>n+e-s,0);
 if(am&&bm){
  if(prevalence&&JSON.stringify(am)!==JSON.stringify(bm))reasons.push('reviewed epoch masks differ');
  if(!prevalence&&commonSeconds===0)reasons.push('no overlapping reviewed epochs');
  if(as<1200-1e-9||bs<1200-1e-9)warnings.push('under 20-minute standard reference window; short-window comparison only');
  if(!prevalence&&commonSeconds<1200-1e-9)warnings.push('common reviewed epochs under 20 minutes');
 }
 const eligible=!!(am&&bm&&as>=1200-1e-9&&bs>=1200-1e-9&&commonSeconds>=1200-1e-9);
 return {admissible:reasons.length===0,standardWindowEligible:reasons.length===0&&eligible,reasons,warnings,referenceUsableSeconds:as,comparisonUsableSeconds:bs,commonReviewedSeconds:am&&bm?commonSeconds:null,commonReviewedMask:am&&bm?common:null};
}
module.exports={mask,seconds,acquisition,intersect,compare};
