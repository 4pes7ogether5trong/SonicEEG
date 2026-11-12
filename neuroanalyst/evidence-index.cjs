'use strict';
// Recording-local synthetic metadata only; no waveform payloads or PHI.
const ID=/^[A-Za-z0-9_.:-]{1,128}$/;
const validId=x=>typeof x==='string'&&ID.test(x);
const validTime=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
function indexEvidence(spans){
 if(!Array.isArray(spans))throw new TypeError('spans must be an array');
 const index=new Map();
 for(const span of spans){
  if(!span||!validId(span.id)||!validTime(span.start)||!validTime(span.end)||span.end<span.start||!validId(span.recordingId))throw new TypeError('invalid evidence span');
  if(index.has(span.id))throw new TypeError('duplicate evidence id');
  index.set(span.id,Object.freeze({id:span.id,recordingId:span.recordingId,start:span.start,end:span.end}));
 }
 return index;
}
function auditDraftEvidence(draft,spans){
 if(!draft||!validId(draft.recordingId)||!Array.isArray(draft.findings))throw new TypeError('invalid draft');
 const index=indexEvidence(spans),problems=[];
 for(const finding of draft.findings){
  if(!finding||!validId(finding.id)||!finding.intervalSeconds||!validTime(finding.intervalSeconds.start)||!validTime(finding.intervalSeconds.end)||finding.intervalSeconds.end<finding.intervalSeconds.start||!Array.isArray(finding.evidenceIds)||!Array.isArray(finding.overlappingSeizureEvidenceIds))throw new TypeError('invalid finding');
  const ids=[...finding.evidenceIds,...finding.overlappingSeizureEvidenceIds];
  if(!finding.evidenceIds.length)problems.push({findingId:finding.id,issue:'missing_evidence'});
  for(const id of new Set(ids)){
   if(!validId(id)){problems.push({findingId:finding.id,issue:'invalid_evidence_id'});continue;}
   const span=index.get(id);
   if(!span){problems.push({findingId:finding.id,issue:'unresolved_evidence',evidenceId:id});continue;}
   if(span.recordingId!==draft.recordingId)problems.push({findingId:finding.id,issue:'wrong_recording',evidenceId:id});
   const a=finding.intervalSeconds,b=span;
   const overlaps=b.start===b.end ? (a.start===a.end ? b.start===a.start : a.start<=b.start&&b.start<a.end) : a.start===a.end ? b.start<=a.start&&a.start<b.end : a.start<b.end&&b.start<a.end;
   // Overlap evidence references a seizure candidate, not necessarily this finding's interval.
   if(finding.evidenceIds.includes(id)&&!overlaps)problems.push({findingId:finding.id,issue:'evidence_outside_candidate',evidenceId:id});
  }
 }
 return Object.freeze({ok:problems.length===0,problems});
}
module.exports={indexEvidence,auditDraftEvidence};
