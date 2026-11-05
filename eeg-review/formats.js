/* Additional browser-local readers. No uploads. */
(() => {
'use strict';
const C=window.EEGCore;
function finite(n,label,positive=false){if(typeof n!=='number'||!Number.isFinite(n)||(positive&&n<=0))throw Error('Invalid '+label+'.');return n;}
function count(n,label,max=Number.MAX_SAFE_INTEGER){if(!Number.isSafeInteger(n)||n<1||n>max)throw Error('Invalid '+label+'.');return n;}
function sampleWindow(start,end,fs,n){finite(start,'window start');finite(end,'window end');if(end<start)throw Error('Invalid time window.');return [Math.min(n,Math.max(0,Math.floor(start*fs))),Math.min(n,Math.max(0,Math.ceil(end*fs)))];}
async function openReview(file){
 const initial=await file.slice(0,16).arrayBuffer();
 if(initial.byteLength!==16||new TextDecoder().decode(new Uint8Array(initial,0,8))!=='EEGRVW1\n')throw Error('Not an EEG Review recording.');
 const dv=new DataView(initial),length=count(dv.getUint32(8,true),'header length',8*1024*1024);
 if(dv.getUint32(12,true)!==0)throw Error('Unknown EEG Review header flags.');
 let h;try{h=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await file.slice(16,16+length).arrayBuffer()));}catch{throw Error('Unreadable EEG Review metadata.');}
 if(h.schema!=='eeg-review/1'||h.sample_type!=='float64-le'||h.layout!=='sample-major'||h.unit!=='uV')throw Error('Unsupported EEG Review encoding.');
 const fs=finite(h.sample_rate,'sample rate',true),n=count(h.sample_count,'sample count');
 if(fs>100000||!Array.isArray(h.channels)||h.channels.length<1||h.channels.length>512)throw Error('Invalid EEG Review channel metadata.');
 const stride=h.channels.length*8,dataStart=16+length;
 if(!Number.isSafeInteger(n*stride)||file.size!==dataStart+n*stride)throw Error('Truncated EEG Review recording or inconsistent sample count.');
 const channels=h.channels.map((c,id)=>{if(!c||typeof c.label!=='string'||!c.label||c.label.length>256||!['unknown'].includes(c.reference))throw Error('Invalid channel label or unverified reference metadata.');return {id,label:c.label,unit:'µV',factor:1,fs,...C.labelInfo(c.label),reference:'unknown',prefilter:String(c.prefilter||'Not specified')};});
 if(!Array.isArray(h.events)||h.events.length>100000||!Array.isArray(h.warnings))throw Error('Invalid event/warning metadata.');
 const events=h.events.map(e=>({time:finite(e.time,'event time'),duration:finite(e.duration,'event duration'),text:String(e.text).slice(0,4096)}));
 if(events.some(e=>e.duration<0))throw Error('Negative event duration.');
 const meta={kind:'review',format:'Converted '+String(h.source_format||'EEG').slice(0,40),name:file.name,channels,duration:n/fs,origin:0,events,warnings:h.warnings.map(String),sourceDetails:h};
 meta.warnings.push('Prepared locally from '+String(h.source_format)+'. Acquisition reference is unverified; confirm it before changing reference.');
 meta.read=async(start,end,ids)=>{const [a,z]=sampleWindow(start,end,fs,n);if((z-a)*stride>64*1024*1024||(z-a)*ids.length>4000000)throw Error('Window exceeds the tablet read budget. Choose a shorter page.');
 const v=new DataView(await file.slice(dataStart+a*stride,dataStart+z*stride).arrayBuffer()),series=new Map();for(const id of ids){if(!channels[id])throw Error('Unknown source channel.');const data=new Float64Array(z-a);for(let i=0;i<data.length;i++){data[i]=v.getFloat64(i*stride+id*8,true);if(!Number.isFinite(data[i]))throw Error('Missing or non-finite sample in prepared recording.');}series.set(id,{data,fs,start:a/fs});}return {series,events};};return meta;
}
async function openNicolet(files){
 const headers=files.filter(f=>/\.head$/i.test(f.name));if(headers.length!==1)throw Error('Select one Nicolet .head header and its matching .data file.');
 const header=headers[0],stem=header.name.slice(0,-5).toLowerCase(),data=files.find(f=>f.name.toLowerCase()===stem+'.data');
 if(!data)throw Error('The matching Nicolet .data file is missing.');if(header.size>1024*1024)throw Error('Nicolet header is unexpectedly large.');
 const h={};for(const line of (await header.text()).split(/\r?\n/)){if(!line.trim())continue;const eq=line.indexOf('=');if(eq<1)throw Error('Invalid Nicolet header.');const key=line.slice(0,eq).trim();if(Object.hasOwn(h,key))throw Error('Duplicate Nicolet header field.');h[key]=line.slice(eq+1).trim();}
 if(!/^\[.*\]$/.test(h.elec_names||''))throw Error('Nicolet electrode names are missing.');
 const labels=h.elec_names.slice(1,-1).split(',').map(x=>x.trim()),nc=count(Number(h.num_channels),'channel count',512),n=count(Number(h.num_samples),'sample count'),fs=finite(Number(h.sample_freq),'sample rate',true),cal=finite(Number(h.conversion_factor),'Nicolet calibration',true);
 if(!Number.isSafeInteger(n*nc*2)||fs>100000||labels.length!==nc||labels.some(x=>!x||x.length>256)||data.size!==n*nc*2)throw Error('Nicolet header does not match the data file.');
 const channels=labels.map((label,id)=>({id,label,unit:'µV',factor:1,fs,...C.labelInfo(label),prefilter:'Not specified by Nicolet binary-export header'}));
 const meta={kind:'nicolet',format:'Nicolet export',name:data.name,channels,duration:n/fs,origin:0,events:[],warnings:['Nicolet .head/.data binary export. Native NicoletOne .e/.one containers and vendor annotations are not imported.']};
 meta.read=async(start,end,ids)=>{const [a,z]=sampleWindow(start,end,fs,n),stride=nc*2;if((z-a)*stride>64*1024*1024||(z-a)*ids.length>4000000)throw Error('Window exceeds the tablet read budget.');const v=new DataView(await data.slice(a*stride,z*stride).arrayBuffer()),series=new Map();for(const id of ids){if(!channels[id])throw Error('Unknown source channel.');const values=new Float64Array(z-a);for(let i=0;i<values.length;i++)values[i]=v.getInt16(i*stride+id*2,true)*cal;series.set(id,{data:values,fs,start:a/fs});}return {series,events:[]};};return meta;
}
function importAdvice(name){const n=name.toLowerCase();if(/\.(arc|ez3|eas)$/.test(n))return 'Cadwell Arc / Easy III native decoding is blocked pending vendor reader integration. Export a continuous EDF recording, then open that export here.';if(/\.(erd|stc|etc|ent|e|one)$/.test(n))return 'This native Xltek / Nicolet container is not decoded yet. Use a continuous EDF or supported Persyst export. Keep the original recording intact.';if(/\.(set|fdt|fif|fif.gz|xdf|nwb|lay)$/.test(n))return 'Prepare this recording with the local converter on a computer, then open the resulting .eegreview file on this iPad. File compatibility includes the download and instructions.';if(/\.(eeg|21e|pnt|log)$/.test(n))return 'For BrainVision, select .vhdr with its data and markers. For Nihon Kohden, use the local converter with format nihon, keeping .EEG/.21E/.PNT/.LOG together.';return 'Unsupported or incomplete file selection. Open File compatibility for direct readers, local conversion, and vendor export options.';}
C.openReview=openReview;C.openNicolet=openNicolet;C.importAdvice=importAdvice;
})();
