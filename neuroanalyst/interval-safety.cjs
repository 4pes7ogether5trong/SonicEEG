'use strict';
// Metadata-only interval safety layer; not an EEG detector or diagnosis.
const {groupEpisodesV2} = require('./episode-grouping-v2.cjs');
function groupWithIntervalSafety(events, options={}) {
  if (!Array.isArray(events)) throw new TypeError('events must be an array');
  const groups=groupEpisodesV2(events,options);
  const seizures=groups.filter(g=>g.kind==='seizure');
  // Half-open spans [start,end); point annotations occupy an instant.
  // A point at onset overlaps, but a point at offset does not.
  const overlaps=(a,b)=>{
    const ap=a.start===a.end,bp=b.start===b.end;
    if(ap&&bp)return a.start===b.start;
    if(ap)return b.start<=a.start&&a.start<b.end;
    if(bp)return a.start<=b.start&&b.start<a.end;
    return a.start<b.end&&b.start<a.end;
  };
  for(const g of groups){
    if(g.kind==='seizure') {
      g.boundaryStatus='candidate_unverified';
      g.overlappingSeizureCount=seizures.filter(s=>s!==g && overlaps(g,s)).length;
      continue;
    }
    const conflicts=seizures.filter(s=>overlaps(g,s));
    g.seizureOverlapCount=conflicts.length;
    if(conflicts.length){
      g.reviewRequired=true;
      g.boundaryStatus='overlaps_seizure_candidate';
      g.overlappingSeizureEvidenceIds=[...new Set(conflicts.flatMap(s=>s.evidenceIds))];
    } else g.boundaryStatus='not_overlapping_seizure_candidate';
  }
  return groups;
}
module.exports={groupWithIntervalSafety};
