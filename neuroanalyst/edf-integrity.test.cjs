'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{inspect}=require('./edf-integrity.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'edf-integrity-'));let count=0;
function make({records=2,channels=1,samples=256,extra=0,version='0',badCal=false}={}){
 const widths=[16,80,8,8,8,8,8,80,8,32],vals=[Array(channels).fill('Fp1'),Array(channels).fill(''),Array(channels).fill('uV'),Array(channels).fill('-100'),Array(channels).fill(badCal?'-100':'100'),Array(channels).fill('-32768'),Array(channels).fill('32767'),Array(channels).fill(''),Array(channels).fill(String(samples)),Array(channels).fill('')];
 const head=Buffer.alloc(256,' '),set=(at,len,v)=>head.write(String(v).padEnd(len,' ').slice(0,len),at,'latin1');set(0,8,version);set(184,8,256*(channels+1));set(236,8,records);set(244,8,1);set(252,4,channels);
 const tail=Buffer.from(vals.map((a,i)=>a.map(x=>x.padEnd(widths[i],' ')).join('')).join(''),'latin1');const p=path.join(dir,'case'+Math.random()+'.edf');fs.writeFileSync(p,Buffer.concat([head,tail,Buffer.alloc(Math.max(0,records)*channels*samples*2+extra)]));return p;
}
function t(name,fn){fn();count++;console.log('PASS',name)}
try{
 t('valid waveform geometry and hash',()=>{const x=inspect(make());assert.equal(x.readyForSignalProcessing,true);assert.equal(x.recordingDurationSeconds,2);assert.equal(x.channels[0].sampleHz,256);assert.match(x.sha256,/^[a-f0-9]{64}$/)});
 t('multi-channel sample geometry',()=>{const x=inspect(make({channels:2,samples:512}));assert.equal(x.bytesPerRecord,2048);assert.equal(x.channelCount,2)});
 t('trailing bytes reject admission',()=>{const x=inspect(make({extra:2}));assert.deepEqual(x.issues,['edf_size_mismatch'])});
 t('zero record count reject admission',()=>assert.equal(inspect(make({records:0})).readyForSignalProcessing,false));
 t('unsupported version rejected',()=>assert.throws(()=>inspect(make({version:'EDF+'}),/unsupported_edf_version/)));
 t('invalid calibration rejected',()=>assert.throws(()=>inspect(make({badCal:true}),/invalid_channel_calibration/)));
 t('truncated EDF rejected',()=>{const p=make();fs.truncateSync(p,100);assert.throws(()=>inspect(p),/edf_too_small/)});
 t('missing file rejected',()=>assert.throws(()=>inspect(path.join(dir,'missing'))));
 console.log(count+' tests passed');
}finally{fs.rmSync(dir,{recursive:true,force:true})}
