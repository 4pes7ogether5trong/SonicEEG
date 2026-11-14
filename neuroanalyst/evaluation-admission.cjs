'use strict';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
function mask(v){if(!Array.isArray(v)||!v.length)throw Error('review mask required');const a=v.map(p=>{if(!Array.isArray(p)||p.length!==2||!finite(p[0])||!finite(p[1])||p[0]<0||p[1]<=p[0])throw Error('invalid interval');return [...p]}).sort((a,b)=>a[0]-b[0]);const out=[];for(const [s,e] of a){const last=out.at(-1);if(last&&s<=last[1])last[1]=Math.max(e,last[1]);else out.push([s,e])}return out}
function seconds(m){return mask(m).reduce((s,[a,b])=>s+b-a,0)}
function acquisition(m){if(!m||!Array.isArray(m.derivations)||!m.derivations.length)throw Error('derivations required');for(const k of ['sampleHz','highPassHz','lowPassHz','notchHz','reference','electrodes'])if(!(k in m))throw Error('missing '+k);if(!finite(m.sampleHz)||m.sampleHz<=0||!finite(m.highPassHz)||m.highPassHz<0||!finite(m.lowPassHz)||m.lowPassHz<=m.highPassHz||m.lowPassHz>m.sampleHz/2||m.notchHz!==null&&(!finite(m.notchHz)||m.notchHz<=0||m.notchHz>=m.sampleHz/2))throw Error('invalid filters');if(typeof m.reference!=='string'||!m.reference.trim()||!Array.isArray(m.electrodes)||!m.electrodes.length||m.electrodes.some(e=>typeof e!=='string'||!e.trim())||new Set(m.electrodes).size!==m.electrodes.length)throw Error('invalid electrodes/reference');const d=m.derivations.map(x=>{if(!Array.isArray(x)||x.length!==2||x[0]===x[1]||x.some(e=>!m.electrodes.includes(e)))throw Error('invalid derivation');return x.join(' - ')});if(new Set(d).size!==d.length)throw Error('duplicate derivation');return {...m,electrodes:[...m.electrodes].sort(),derivations:d.sort()}}
function intersect(a,b){const x=mask(a),y=mask(b),out=[];let i=0,j=0;while(i<x.length&&j<y.length){const s=Math.max(x[i][0],y[j][0]),e=Math.min(x[i][1],y[j][1]);if(e>s)out.push([s,e]);if(x[i][1]<=y[j][1])i++;else j++;}return out;}
function compare(a,b,{prevalence=false}={}){
 const reasons=[],warnings=[];let x,y;
 try{x=acquisition(a.acquisition);y=acquisition(b.acquisition)}catch(e){return {admissible:false,standardWindowEligible:false,reasons:[e.message],warnings};}
 for(const k of ['sampleHz','highPassHz','lowPassHz','notchHz','reference','electrodes','derivations'])if(JSON.stringify(x[k])!==JSON.stringify(y[k]))reasons.push('acquisition mismatch: '+k);
 let am,bm;try{am=mask(a.reviewedMask);bm=mask(b.reviewedMask)}catch(e){reasons.push(e.message);}
 if(am&&bm&&prevalence&&JSON.stringify(am)!==JSON.stringify(bm))reasons.push('reviewed epoch masks differ');
 const as=am?seconds(am):null,bs=bm?seconds(bm):null;
 const common=am&&bm?intersect(am,bm):null,commonSeconds=common?common.reduce((s,[a,b])=>s+b-a,0):null;
 if(common&&commonSeconds===0)reasons.push('no common reviewed EEG');
 const standardWindowEligible=!!(common&&as>=1200&&bs>=1200&&commonSeconds>=1200);
 if(common&&!standardWindowEligible)warnings.push('not eligible for standard 20-minute comparison; short-window comparison only');
 return {admissible:reasons.length===0,standardWindowEligible:reasons.length===0&&standardWindowEligible,reasons,warnings,referenceUsableSeconds:as,comparisonUsableSeconds:bs,commonReviewedSeconds:commonSeconds,commonReviewedMask:common};
}
module.exports={mask,seconds,acquisition,intersect,compare};
