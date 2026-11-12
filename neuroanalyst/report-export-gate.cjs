'use strict';
// Metadata-only unverified draft export gate. No PHI detection or clinical approval.
const KINDS=new Set(['seizure','RDA','PD','BIRD','interictal_discharge','blink','vertex','k_complex','spindle','state_change']);
const POINT_KINDS=new Set(['blink','vertex','k_complex','spindle','state_change','interictal_discharge']);
const ISSUES=new Set(['missing_evidence','verify_onset_offset','verify_BIRD_criteria','review_seizure_overlap','review_overlapping_seizure_candidates','verify_pattern_classification','verify_state_or_artifact','low_confidence_seizure_candidate']);
function fail(message){throw new TypeError(message)}
function id(s){return typeof s==='string'&&s.length>0&&s.length<=128&&/^[A-Za-z0-9_.:-]+$/.test(s)}
function finite(n){return typeof n==='number'&&Number.isFinite(n)}
function exportUnverifiedDraft(d){
 if(!d||typeof d!=='object'||Array.isArray(d))fail('draft object required');
 if(d.schemaVersion!=='0.1.0'||!id(d.recordingId)||d.reportStatus!=='draft_unverified'||d.automatedClinicalInterpretation!==false)fail('invalid draft metadata');
 if(!d.signoff||d.signoff.approved!==false||d.signoff.technician!==null||d.signoff.physician!==null)fail('draft signoff forbidden');
 if(!Array.isArray(d.findings)||!d.summary||d.summary.candidateCount!==d.findings.length||d.summary.reviewRequiredCount!==d.findings.length)fail('invalid summary');
 const seen=new Set();
 const findings=d.findings.map(f=>{
  if(!f||!id(f.id)||seen.has(f.id))fail('invalid/duplicate finding id');seen.add(f.id);
  if(!KINDS.has(f.kind)||f.status!=='unverified_candidate'||f.interpretation!==null)fail('invalid finding status/kind');
  const t=f.intervalSeconds,c=f.confidenceRange;
  if(!t||!finite(t.start)||!finite(t.end)||t.start<0||(t.end<t.start||(t.end===t.start&&!POINT_KINDS.has(f.kind))))fail('invalid interval');
  if(!c||!finite(c.min)||!finite(c.max)||c.min<0||c.max>1||c.min>c.max)fail('invalid confidence');
  if(!Number.isSafeInteger(f.occurrences)||f.occurrences<1)fail('invalid occurrences');
  if(!Array.isArray(f.evidenceIds)||!f.evidenceIds.every(id)||new Set(f.evidenceIds).size!==f.evidenceIds.length)fail('invalid evidence');
  if(!Array.isArray(f.overlappingSeizureEvidenceIds)||!f.overlappingSeizureEvidenceIds.every(id))fail('invalid overlap evidence');
  if(!Array.isArray(f.reviewIssues)||!f.reviewIssues.every(i=>ISSUES.has(i))||new Set(f.reviewIssues).size!==f.reviewIssues.length)fail('invalid review issues');
  if(f.evidenceIds.length===0&&!f.reviewIssues.includes('missing_evidence'))fail('missing evidence flag');
  if(f.kind==='seizure'&&!f.reviewIssues.includes('verify_onset_offset'))fail('seizure boundary review required');
  return {id:f.id,kind:f.kind,intervalSeconds:{start:t.start,end:t.end},occurrences:f.occurrences,confidenceRange:{min:c.min,max:c.max},evidenceIds:[...f.evidenceIds],overlappingSeizureEvidenceIds:[...f.overlappingSeizureEvidenceIds],reviewIssues:[...f.reviewIssues],status:'unverified_candidate',interpretation:null};
 });
 return JSON.stringify({schemaVersion:'0.1.0',recordingId:d.recordingId,reportStatus:'draft_unverified',automatedClinicalInterpretation:false,findings,summary:{candidateCount:findings.length,reviewRequiredCount:findings.length},signoff:{technician:null,physician:null,approved:false}});
}
module.exports={exportUnverifiedDraft};
