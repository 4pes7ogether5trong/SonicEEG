'use strict';
// Fail-closed metadata-only export; does not establish deidentification or clinical validity.
const {exportUnverifiedDraft}=require('./report-export-gate.cjs');
const {auditDraftEvidence,indexEvidence}=require('./evidence-index.cjs');
function exportWithVerifiedEvidence(draft,manifest){
  const normalized=JSON.parse(exportUnverifiedDraft(draft));
  if(!Array.isArray(manifest))throw new TypeError('recording-local evidence manifest required');
  const index=indexEvidence(manifest);
  for(const span of index.values())if(span.recordingId!==normalized.recordingId)throw new TypeError('manifest contains foreign recording evidence');
  const audit=auditDraftEvidence(normalized,manifest);
  if(!audit.ok)throw new TypeError('evidence audit failed: '+[...new Set(audit.problems.map(p=>p.issue))].sort().join(','));
  const seizureEvidence=new Set(normalized.findings.filter(f=>f.kind==='seizure').flatMap(f=>f.evidenceIds));
  for(const finding of normalized.findings){
    if(finding.reviewIssues.includes('missing_evidence'))throw new TypeError('stale missing_evidence flag');
    if(finding.overlappingSeizureEvidenceIds.some(id=>!seizureEvidence.has(id)))throw new TypeError('overlap evidence does not reference seizure candidate');
    if(finding.overlappingSeizureEvidenceIds.length && !finding.reviewIssues.some(x=>x==='review_seizure_overlap'||x==='review_overlapping_seizure_candidates'))throw new TypeError('unflagged seizure overlap');
  }
  return JSON.stringify(normalized);
}
module.exports={exportWithVerifiedEvidence};
