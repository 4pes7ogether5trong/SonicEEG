'use strict';
const fs=require('node:fs');
const parse=s=>{if(!s.trim())throw Error('empty EDF number');const n=Number(s.trim());if(!Number.isFinite(n))throw Error('invalid EDF number');return n};
function readWindow(file,{channel,startSeconds,durationSeconds,maxSamples=2000000}){
 if(!Number.isInteger(channel)||channel<0||!Number.isFinite(startSeconds)||startSeconds<0||!Number.isFinite(durationSeconds)||durationSeconds<=0||!Number.isSafeInteger(maxSamples)||maxSamples<1)throw Error('invalid window');
 const fd=fs.openSync(file,'r');try{
 const h=Buffer.alloc(256);if(fs.readSync(fd,h,0,256,0)!==256)throw Error('short header');
 const s=h.toString('latin1');if(s.slice(0,8).trim()!=='0')throw Error('unsupported EDF version');
 const count=parse(s.slice(252,256)),headerBytes=parse(s.slice(184,192)),records=parse(s.slice(236,244)),seconds=parse(s.slice(244,252));
 if(!Number.isInteger(count)||count<1||count>4096||headerBytes!==256*(count+1)||!Number.isSafeInteger(records)||records<1||seconds<=0||channel>=count)throw Error('invalid EDF geometry');
 if(s.slice(192,236).includes('EDF+D'))throw Error('discontinuous EDF requires timekeeping');
 const sh=Buffer.alloc(headerBytes-256);if(fs.readSync(fd,sh,0,sh.length,256)!==sh.length)throw Error('short channel header');
 let pos=0;const field=width=>{const a=[];for(let i=0;i<count;i++){a.push(sh.toString('latin1',pos,pos+width).trim());pos+=width;}return a};
 const labels=field(16);field(80);const units=field(8),pmin=field(8),pmax=field(8),dmin=field(8),dmax=field(8);field(80);const samples=field(8).map(parse);field(32);
 if(samples.some(x=>!Number.isSafeInteger(x)||x<1))throw Error('invalid samples');
 if(/EDF Annotations/i.test(labels[channel]))throw Error('annotation channel is not calibrated EEG');
 const sizes=samples.map(x=>x*2),bytesPerRecord=sizes.reduce((a,b)=>a+b,0),offset=sizes.slice(0,channel).reduce((a,b)=>a+b,0);
 if(!Number.isSafeInteger(bytesPerRecord)||!Number.isSafeInteger(headerBytes+records*bytesPerRecord)||fs.fstatSync(fd).size!==headerBytes+records*bytesPerRecord)throw Error('EDF byte geometry mismatch');
 if(startSeconds+durationSeconds>records*seconds+1e-9)throw Error('window exceeds recording');
 const a=parse(pmin[channel]),b=parse(pmax[channel]),c=parse(dmin[channel]),d=parse(dmax[channel]);if(a>=b||c>=d)throw Error('invalid calibration');
 const hz=samples[channel]/seconds,first=Math.ceil(startSeconds*hz-1e-9),last=Math.ceil((startSeconds+durationSeconds)*hz-1e-9),n=last-first;
 if(!Number.isSafeInteger(first)||!Number.isSafeInteger(last)||n<0||n>maxSamples)throw Error('window exceeds sample safety limit');
 const values=new Array(n),recordBuffer=Buffer.alloc(sizes[channel]);let loaded=-1;
 for(let k=0;k<n;k++){const i=first+k,rec=Math.floor(i/samples[channel]),j=i%samples[channel];if(rec!==loaded){if(fs.readSync(fd,recordBuffer,0,recordBuffer.length,headerBytes+rec*bytesPerRecord+offset)!==recordBuffer.length)throw Error('short signal');loaded=rec;}values[k]=a+(recordBuffer.readInt16LE(j*2)-c)*(b-a)/(d-c);}
 return {channel,label:labels[channel],unit:units[channel],sampleHz:hz,startSeconds,requestedDurationSeconds:durationSeconds,sampleCount:n,values,source:'EDF calibrated signal; no clinical interpretation'};
 }finally{fs.closeSync(fd)}
}
module.exports={readWindow};
