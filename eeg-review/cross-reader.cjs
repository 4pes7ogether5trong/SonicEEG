// Integration bridge: compare the exact browser readers with locally converted data.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ctx={TextDecoder,window:{}};vm.createContext(ctx);
for(const file of ['core.js','formats.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'),ctx);
const C=ctx.window.EEGCore;
function localFile(p){const b=fs.readFileSync(p);return {name:path.basename(p),size:b.length,text:async()=>b.toString('utf8'),slice(a,z){const q=b.subarray(a,z);return {arrayBuffer:async()=>q.buffer.slice(q.byteOffset,q.byteOffset+q.byteLength)};}};}
(async()=>{const source=process.argv[2],prepared=process.argv[3];const out={};
for(const [key,meta] of [['nicolet',await C.openNicolet([localFile(source),localFile(source.replace(/\.data$/i,'.head'))])],['prepared',await C.openReview(localFile(prepared))]]){
 const result=await meta.read(0,meta.duration,meta.channels.map(c=>c.id));out[key]=[...result.series.values()].map(v=>[...v.data]);
}
console.log(JSON.stringify(out));})().catch(e=>{console.error(e);process.exitCode=1;});
