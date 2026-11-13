'use strict';
const assert=require('node:assert/strict');
const {triageEpisode}=require('./episode-landmarks.cjs');
const base={onset:0,offset:30,baselineState:'awake'};
const l=(id,time,kind,patternId='a',field='left')=>({id,time,kind,patternId,field});
const cases=[
 ['valid single',()=>assert.equal(triageEpisode({...base,landmarks:[l('1',2,'onset'),l('2',20,'offset')]}).requiresReview,false)],
 ['overlapping patterns independent',()=>assert.deepEqual(triageEpisode({...base,landmarks:[l('1',2,'onset'),l('2',5,'onset','b'),l('3',12,'offset'),l('4',21,'offset','b')]}).unresolvedPatternIds,[])],
 ['missing offset',()=>assert.deepEqual(triageEpisode({...base,landmarks:[l('1',2,'onset')]}).unresolvedPatternIds,['a'])],
 ['orphan offset',()=>assert.ok(triageEpisode({...base,landmarks:[l('1',2,'offset')]}).flags.some(x=>x.reason==='orphan-offset'))],
 ['duplicate onset',()=>assert.ok(triageEpisode({...base,landmarks:[l('1',2,'onset'),l('2',4,'onset')]}).flags.some(x=>x.reason==='duplicate-onset'))],
 ['premature baseline',()=>assert.ok(triageEpisode({...base,landmarks:[l('1',2,'onset'),l('2',4,'baseline-return'),l('3',8,'offset')]}).requiresReview)],
 ['quality obscured',()=>assert.ok(triageEpisode({...base,qualityGaps:[[10,15]],landmarks:[l('1',2,'onset'),l('2',12,'offset')]}).flags.some(x=>x.reason==='quality-gap'))],
 ['no post artifact followthrough',()=>assert.ok(triageEpisode({...base,qualityGaps:[[10,15]],landmarks:[l('1',2,'onset'),l('2',8,'offset')]}).flags.some(x=>x.reason==='no-post-artifact-followthrough'))],
 ['post artifact followthrough',()=>assert.equal(triageEpisode({...base,qualityGaps:[[10,15]],landmarks:[l('1',2,'onset'),l('2',20,'offset')]}).requiresReview,false)],
 ['state baseline missing',()=>assert.ok(triageEpisode({onset:0,offset:30,landmarks:[l('1',2,'state-change')]}).requiresReview)],
 ['duplicate ID rejected',()=>assert.throws(()=>triageEpisode({...base,landmarks:[l('1',2,'onset'),l('1',5,'offset')]}))],
 ['out of range rejected',()=>assert.throws(()=>triageEpisode({...base,landmarks:[l('1',31,'onset')]}))],
 ['invalid gap rejected',()=>assert.throws(()=>triageEpisode({...base,landmarks:[],qualityGaps:[[10,9]]}))],
 ['no landmark no invented detection',()=>assert.deepEqual(triageEpisode({...base,landmarks:[]}).transitions,[])],
];
for(const [name,test] of cases){test();console.log('PASS',name)}
console.log(cases.length,'synthetic tests passed');
