'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const num=(s,label)=>{const n=Number(s.trim());if(!s.trim()||!Number.isFinite(n))throw Error('invalid_'+label);return n};
function inspect(path){
 const stat=fs.statSync(path);if(!stat.isFile()||stat.size<256)throw Error('edf_too_small');
 const fd=fs.openSync(path,'r');
 try{
  const b=Buffer.alloc(256);if(fs.readSync(fd,b,0,256,0)!==256)throw Error('edf_short_header');
  const a=b.toString('latin1'),version=a.slice(0,8).trim();if(version!=='0')throw Error('unsupported_edf_version');
  const headerBytes=num(a.slice(184,192),'header_bytes'),records=num(a.slice(236,244),'record_count'),recordSeconds=num(a.slice(244,252),'record_seconds'),channels=num(a.slice(252,256),'channel_count');
  if(!Number.isInteger(channels)||channels<1||channels>4096||headerBytes!==256*(channels+1)||!Number.isInteger(records)||records<0||recordSeconds<=0)throw Error('invalid_edf_geometry');
  if(stat.size<headerBytes)throw Error('edf_short_signal_header');
  const sh=Buffer.alloc(headerBytes-256);fs.readSync(fd,sh,0,sh.length,256);
  let cursor=0;const field=(width)=>{const out=[];for(let i=0;i<channels;i++){out.push(sh.toString('latin1',cursor,cursor+width).trim());cursor+=width}return out};
  const labels=field(16);field(80);const units=field(8),physicalMin=field(8),physicalMax=field(8),digitalMin=field(8),digitalMax=field(8);field(80);const samples=field(8);field(32);
  const channelsOut=labels.map((label,i)=>{const n=num(samples[i],'samples_per_record'),pmin=num(physicalMin[i],'physical_min'),pmax=num(physicalMax[i],'physical_max'),dmin=num(digitalMin[i],'digital_min'),dmax=num(digitalMax[i],'digital_max');if(!Number.isInteger(n)||n<1||pmin>=pmax||dmin>=dmax)throw Error('invalid_channel_calibration');return {label,unit:units[i],sampleHz:n/recordSeconds,samplesPerRecord:n};});
  const bytesPerRecord=channelsOut.reduce((sum,c)=>sum+c.samplesPerRecord*2,0),expected=headerBytes+records*bytesPerRecord;
  const fileSizeMatches=expected===stat.size;
  return {format:'EDF',sizeBytes:stat.size,sha256:crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex'),recordCount:records,recordSeconds,recordingDurationSeconds:records*recordSeconds,channelCount:channels,channels:channelsOut,headerBytes,bytesPerRecord,expectedBytes:expected,fileSizeMatches,readyForSignalProcessing:fileSizeMatches&&records>0,issues:[...(fileSizeMatches?[]:['edf_size_mismatch']),...(records?[]:['edf_unknown_or_empty_record_count'])]};
 }finally{fs.closeSync(fd)}
}
module.exports={inspect};
if(require.main===module){try{const x=inspect(process.argv[2]);console.log(JSON.stringify(x,null,2));process.exitCode=x.readyForSignalProcessing?0:2}catch(e){console.error(e.message);process.exitCode=2}}
