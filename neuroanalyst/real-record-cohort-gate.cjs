'use strict';
// Public Siena/NEMAR annotation fixture. This is NOT an EEG signal evaluation.
const {events}=require('./real-record-annotation-audit.cjs');
function auditReferenceCohort(records){
 if(!Array.isArray(records))throw new TypeError('records required');
 const reasons=[],subjects=new Map(),seen=new Set();
 for(const r of records){
  if(!r||typeof r!=='object'||!r.recording||!r.subject||!['train','validation','test'].includes(r.split)) {reasons.push('invalid_record');continue;}
  if(seen.has(r.recording))reasons.push('duplicate_recording');seen.add(r.recording);
  if(subjects.has(r.subject)&&subjects.get(r.subject)!==r.split)reasons.push('subject_split_leakage');
  subjects.set(r.subject,r.split);
  if(!Array.isArray(r.events)||r.events.some(e=>!Number.isFinite(e.onset)||!Number.isFinite(e.offset)||e.onset<0||e.offset<=e.onset||e.offset>r.duration))reasons.push('invalid_reference_boundary');
  if(!Number.isFinite(r.duration)||r.duration<=0)reasons.push('invalid_duration');
  if(r.waveformAvailable!==true)reasons.push('waveform_unavailable');
  if(r.predictionsAvailable!==true)reasons.push('predictions_unavailable');
  if(r.licenseVerified!==true)reasons.push('license_unverified');
 }
 return {eligibleForWaveformBenchmark:reasons.length===0,reasons:[...new Set(reasons)],recordings:seen.size,independentSubjects:subjects.size,referenceEvents:records.reduce((n,r)=>n+(Array.isArray(r?.events)?r.events.length:0),0)};
}
const referenceOnly=events.map(e=>({recording:e.recording,subject:'siena-PN13',split:'test',duration:{'PN13-1.edf':9355,'PN13-2.edf':9312,'PN13-3.edf':12527}[e.recording],events:[{onset:e.onset,offset:e.offset}],waveformAvailable:false,predictionsAvailable:false,licenseVerified:false}));
if(require.main===module)console.log(JSON.stringify(auditReferenceCohort(referenceOnly),null,2));
module.exports={auditReferenceCohort,referenceOnly};
