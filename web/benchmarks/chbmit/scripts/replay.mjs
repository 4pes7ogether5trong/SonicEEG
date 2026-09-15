// Feed controlled raster frames to the unchanged production worker and persist its outputs.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [repoArg,conditionId,maxFramesArg] = process.argv.slice(2);
if (!repoArg || !conditionId) throw new Error('Usage: node scripts/replay.mjs REPO CONDITION [MAX_FRAMES]');
const repo = path.resolve(repoArg);
const spec = JSON.parse(fs.readFileSync(path.join(root,'spec.json')));
const manifest = JSON.parse(fs.readFileSync(path.join(root,'results/source_manifest.json')));
const c = spec.conditions.find(c=>c.id===conditionId);
if (!c) throw new Error('Unknown fixed condition');
const testSuffix = maxFramesArg ? '_harness_check' : '';
const output = path.join(root,'results',conditionId+testSuffix+'.jsonl');
const pendingOutput = output + '.partial-' + process.pid;
const fd = fs.openSync(pendingOutput,'w');
const rows = c.channel_indices.map((channel,i)=>({name:manifest.used_channels[channel],y:c.baseline_px+i*c.row_spacing_px}));
const config = {mode:'sweep',seconds:spec.seconds_per_page,uvPerPixel:c.uv_per_pixel,negativeUp:spec.negative_up,trackPaths:true,rows,expected:rows.map(r=>r.name),sweepInsetPixels:0,settings:{},segment:'chbmit-controlled-'+conditionId};
let frameIndex=-1, errors=0, messages=0;
const encode = (_,v)=>ArrayBuffer.isView(v)?Array.from(v):v;
globalThis.self={};
globalThis.postMessage=(m)=>{
  if(m.type==='error') errors++;
  messages++;
  // The 'frame' messages retain production validity and band features; avoid duplicating its rolling waveform snapshots.
  if(m.type==='frame') { const {waveform,...frame}=m.frame; m={...m,frame}; }
  fs.writeSync(fd,JSON.stringify({input_frame:frameIndex,...m},encode)+'\n');
};
await import(pathToFileURL(path.join(repo,'browser/signal-worker.js')));
self.onmessage({data:{type:'configure',config,offset:spec.start_s}});
const renderer = spawn(process.env.CODEX_PRIMARY_RUNTIME_PYTHON || 'python3',[path.join(root,'scripts/render.py'),conditionId,...(maxFramesArg?['--frames',maxFramesArg]:[])],{stdio:['ignore','pipe','inherit']});
const finished = new Promise((resolve,reject)=>{renderer.on('error',reject);renderer.on('close',code=>code===0?resolve():reject(new Error('Renderer exit '+code)));});
const size = spec.width*c.height*4;
let buffer=Buffer.allocUnsafe(size),filled=0;
const times=[], started=performance.now();
for await (const chunk of renderer.stdout) {
  let from=0;
  while(from<chunk.length) {
    const n=Math.min(chunk.length-from,size-filled);
    chunk.copy(buffer,filled,from,from+n); filled+=n; from+=n;
    if(filled===size) {
      frameIndex++;
      const t=performance.now();
      const array=buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.length);
      self.onmessage({data:{type:'pixels',width:spec.width,height:c.height,buffer:array,wall:frameIndex/spec.fps}});
      times.push(performance.now()-t);
      if(frameIndex%40===0) process.stderr.write(`${conditionId}: ${frameIndex+1} frames, ${(performance.now()-started).toFixed(0)} ms elapsed\n`);
      filled=0;
    }
  }
}
await finished;
fs.fsyncSync(fd);
fs.closeSync(fd);
if(filled) throw new Error('Truncated RGBA frame');
const expected=maxFramesArg?Math.min(Number(maxFramesArg),(spec.end_s-spec.start_s)*spec.fps+1):(spec.end_s-spec.start_s)*spec.fps+1;
if(frameIndex+1!==expected || errors) throw new Error(`Frames ${frameIndex+1}/${expected}; worker errors ${errors}`);
const saved=fs.readFileSync(pendingOutput,'utf8').trim().split('\n').map(line=>JSON.parse(line));
const statusFrames=saved.filter(m=>m.type==='status').map(m=>m.input_frame);
if(saved.length!==messages || statusFrames.length!==expected || statusFrames.some((v,i)=>v!==i))
  throw new Error(`Saved log incomplete: ${saved.length}/${messages} messages; ${statusFrames.length}/${expected} status frames`);
fs.renameSync(pendingOutput, output);
times.sort((a,b)=>a-b);
const stats={condition:conditionId,frames:frameIndex+1,messages,saved_messages_verified:saved.length,worker_errors:errors,elapsed_s:(performance.now()-started)/1000,worker_ms_median:times[Math.floor(times.length*.5)],worker_ms_p95:times[Math.floor(times.length*.95)],config,output};
fs.writeFileSync(path.join(root,'results',conditionId+testSuffix+'_run.json'),JSON.stringify(stats,null,2)+'\n');
process.stdout.write(JSON.stringify(stats,null,2)+'\n');
