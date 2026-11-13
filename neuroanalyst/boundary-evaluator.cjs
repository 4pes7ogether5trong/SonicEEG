'use strict';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const valid=e=>e&&typeof e.id==='string'&&e.id.length>0&&finite(e.onset)&&finite(e.offset)&&e.offset>e.onset;
function evaluate(reference,predictions,{tolerance=3,uncertain=[],artifact=[]}={}){
 if(!Array.isArray(reference)||!Array.isArray(predictions)||!finite(tolerance)||tolerance<0)throw Error('invalid inputs');
 for(const [events,name] of [[reference,'reference'],[predictions,'prediction']]){
  const ids=new Set();for(const e of events){if(!valid(e))throw Error('invalid event');if(ids.has(e.id))throw Error('duplicate '+name+' id');ids.add(e.id)}
 }
 for(const intervals of [uncertain,artifact])if(!Array.isArray(intervals)||intervals.some(v=>!Array.isArray(v)||v.length!==2||!finite(v[0])||!finite(v[1])||v[1]<v[0]))throw Error('invalid interval');
 const N=reference.length+predictions.length+2,S=N-2,T=N-1,g=Array.from({length:N},()=>[]);
 function add(u,v,cost,meta){const f={to:v,rev:g[v].length,cap:1,cost,meta},b={to:u,rev:g[u].length,cap:0,cost:-cost};g[u].push(f);g[v].push(b)}
 reference.forEach((_,i)=>add(S,i,0));predictions.forEach((_,j)=>add(reference.length+j,T,0));
 reference.forEach((r,i)=>predictions.forEach((p,j)=>{if(Math.min(r.offset,p.offset)>Math.max(r.onset,p.onset))add(i,reference.length+j,Math.abs(r.onset-p.onset)+Math.abs(r.offset-p.offset),{i,j})}));
 while(true){const d=Array(N).fill(Infinity),prev=Array(N).fill(null);d[S]=0;
  for(let k=0;k<N-1;k++){let changed=false;for(let u=0;u<N;u++)if(finite(d[u]))for(let z=0;z<g[u].length;z++){const e=g[u][z];if(e.cap&&d[u]+e.cost<d[e.to]-1e-10){d[e.to]=d[u]+e.cost;prev[e.to]=[u,z];changed=true}}if(!changed)break}
  if(!prev[T])break;for(let v=T;v!==S;){const [u,z]=prev[v],e=g[u][z];e.cap--;g[v][e.rev].cap++;v=u}
 }
 const obscured=t=>uncertain.concat(artifact).some(([a,b])=>a<=t&&t<=b),matched=[],usedP=new Set();
 for(let i=0;i<reference.length;i++)for(const e of g[i])if(e.meta&&!e.cap){
  const p=predictions[e.meta.j],r=reference[i],onsetDelta=p.onset-r.onset,offsetDelta=p.offset-r.offset;
  const onsetAbstain=obscured(p.onset)||obscured(r.onset),offsetAbstain=obscured(p.offset)||obscured(r.offset);
  matched.push({referenceId:r.id,predictionId:p.id,onsetDelta,offsetDelta,onsetAbstain,offsetAbstain,onsetAgreement:onsetAbstain?null:Math.abs(onsetDelta)<=tolerance,offsetAgreement:offsetAbstain?null:Math.abs(offsetDelta)<=tolerance});usedP.add(e.meta.j)
 }
 const onset=matched.filter(x=>x.onsetAgreement!==null),offset=matched.filter(x=>x.offsetAgreement!==null);
 return {referenceCount:reference.length,predictionCount:predictions.length,matchedCount:matched.length,missedCount:reference.length-matched.length,unmatchedPredictionCount:predictions.length-usedP.size,onsetScoredDenominator:onset.length,onsetAgreed:onset.filter(x=>x.onsetAgreement).length,onsetAgreementRate:onset.length?onset.filter(x=>x.onsetAgreement).length/onset.length:null,onsetAbstentions:matched.length-onset.length,offsetScoredDenominator:offset.length,offsetAgreed:offset.filter(x=>x.offsetAgreement).length,offsetAgreementRate:offset.length?offset.filter(x=>x.offsetAgreement).length/offset.length:null,offsetAbstentions:matched.length-offset.length,prematureClosureCount:offset.filter(x=>x.offsetDelta< -tolerance).length,matched};
}
module.exports={evaluate};
