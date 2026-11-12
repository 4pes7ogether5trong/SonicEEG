'use strict';
// Synthetic metadata -> technician review draft. Never a diagnosis or signed report.
const {groupWithIntervalSafety}=require('./interval-safety.cjs');
const SUPPORTED=new Set(['seizure','RDA','PD','BIRD','interictal_discharge','blink','vertex','k_complex','spindle','state_change']);
function buildReviewDraft(events, options={}) {
  if (!Array.isArray(events)) throw new TypeError('events must be an array');
  const {recordingId='synthetic-unassigned',threshold=0.9,gapSeconds=10}=options;
  if(typeof recordingId!=='string'||!recordingId.trim()) throw new TypeError('invalid recordingId');
  // Evidence identifiers are required for every retained candidate; missing provenance
  // must never become an apparently supported report finding.
  const groups=groupWithIntervalSafety(events,{threshold,gapSeconds});
  const findings=groups.map((g,index)=>{
    if(!SUPPORTED.has(g.kind)) throw new TypeError('unsupported finding');
    const issues=[];
    if(!g.evidenceIds.length) issues.push('missing_evidence');
    if(g.kind==='seizure') issues.push('verify_onset_offset');
    if(g.kind==='seizure' && g.belowThreshold) issues.push('low_confidence_seizure_candidate');
    if(g.kind==='BIRD') issues.push('verify_BIRD_criteria');
    if(g.seizureOverlapCount>0) issues.push('review_seizure_overlap');
    if(g.overlappingSeizureCount>0) issues.push('review_overlapping_seizure_candidates');
    if(g.kind==='RDA'||g.kind==='PD'||g.kind==='interictal_discharge') issues.push('verify_pattern_classification');
    if(g.kind==='blink'||g.kind==='vertex'||g.kind==='k_complex'||g.kind==='spindle'||g.kind==='state_change') issues.push('verify_state_or_artifact');
    return Object.freeze({
      id:'candidate-'+String(index+1).padStart(4,'0'),kind:g.kind,
      intervalSeconds:Object.freeze({start:g.start,end:g.end}),
      occurrences:g.count,
      confidenceRange:Object.freeze({min:g.confidenceMin,max:g.confidenceMax}),
      evidenceIds:Object.freeze([...g.evidenceIds]),
      overlappingSeizureEvidenceIds:Object.freeze([...(g.overlappingSeizureEvidenceIds||[])]),
      reviewIssues:Object.freeze(issues),
      status:'unverified_candidate',
      interpretation:null
    });
  });
  return {
    schemaVersion:'0.1.0',recordingId,reportStatus:'draft_unverified',
    automatedClinicalInterpretation:false,
    findings,summary:{candidateCount:findings.length,reviewRequiredCount:findings.length},
    signoff:{technician:null,physician:null,approved:false}
  };
}
module.exports={buildReviewDraft};
