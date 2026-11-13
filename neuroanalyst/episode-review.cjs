'use strict';
// Synthetic metadata-only episode review contract; no diagnostic inference.
const CLASSES=new Set(['seizure','iic','birds','periodic','rhythmic','interictal','artifact','uncertain']);
const FEATURES=['field','frequencyHz','morphology','evolution','fluctuation','plusModifiers'];
function finite(x){return typeof x==='number'&&Number.isFinite(x)}
function validateEpisode(e){
 const issues=[];
 if(!e||typeof e!=='object')return ['episode_missing'];
 if(!e.id||typeof e.id!=='string')issues.push('id_missing');
 if(!CLASSES.has(e.classification))issues.push('classification_invalid');
 if(!finite(e.startSeconds)||!finite(e.endSeconds)||e.startSeconds<0||e.endSeconds<=e.startSeconds)issues.push('interval_invalid');
 if(!Array.isArray(e.channels)||!e.channels.length||e.channels.some(x=>typeof x!=='string'||!x))issues.push('channels_missing');
 if(!e.features||FEATURES.some(k=>!(k in e.features)))issues.push('features_incomplete');
 if(!Array.isArray(e.evidenceIds)||!e.evidenceIds.length)issues.push('evidence_missing');
 if(!Array.isArray(e.qualityIntervals))issues.push('quality_intervals_missing');
 else for(const q of e.qualityIntervals){if(!finite(q.startSeconds)||!finite(q.endSeconds)||q.startSeconds<e.startSeconds||q.endSeconds>e.endSeconds||q.startSeconds>=q.endSeconds||!['usable','artifact','uncertain'].includes(q.quality))issues.push('quality_interval_invalid')}
 if(!e.baseline||!e.baseline.sameStateReferenceId||!e.baseline.priorEventComparisonIds||!Array.isArray(e.baseline.priorEventComparisonIds))issues.push('baseline_context_missing');
 if(!['non-neonatal','neonatal','unknown'].includes(e.ageContext))issues.push('age_context_missing');
 if(e.classification==='iic'&&e.ageContext!=='non-neonatal')issues.push('iic_age_scope_unverified');
 if(e.classification==='seizure'&&(!e.boundary||!['point','range','indeterminate'].includes(e.boundary.offsetType)))issues.push('offset_uncertainty_missing');
 if(!['reviewer-confirmed','candidate','unreviewed'].includes(e.reviewStatus))issues.push('review_status_missing');
 return [...new Set(issues)];
}
function prepareEpisodeReview(episodes){
 if(!Array.isArray(episodes))throw Error('episodes must be array');
 const seen=new Set();return episodes.map(e=>{
 const issues=validateEpisode(e);if(e&&seen.has(e.id))issues.push('duplicate_id');if(e)seen.add(e.id);
 const artifact=(e?.qualityIntervals||[]).some(q=>q.quality!=='usable');
 return {id:e?.id??null,classification:e?.classification??null,reviewStatus:e?.reviewStatus??null,exportEligible:issues.length===0&&e.reviewStatus==='reviewer-confirmed'&&!artifact,requiresReview:issues.length>0||artifact||e.reviewStatus!=='reviewer-confirmed',reasons:[...issues,...(artifact?['quality_uncertainty_requires_post_artifact_check']:[])]};
 });
}
module.exports={validateEpisode,prepareEpisodeReview};
