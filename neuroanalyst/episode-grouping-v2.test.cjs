'use strict';
const assert=require('node:assert/strict');
const {groupEpisodesV2:g}=require('./episode-grouping-v2.cjs');
const t=(kind,time,extra={})=>({kind,time,confidence:.95,evidenceId:kind+time,...extra});
const checks=[
 ()=>assert.deepEqual(g([t('PD',0),t('RDA',1),t('PD',5)]).filter(x=>x.kind==='PD').map(x=>x.count),[2]),
 ()=>assert.deepEqual(g([t('PD',0),t('seizure',2,{duration:3}),t('PD',6)]).filter(x=>x.kind==='PD').map(x=>x.count),[1,1]),
 ()=>assert.equal(g([t('seizure',0),t('seizure',1)]).length,2),
 ()=>assert.deepEqual(g([t('blink',0),t('blink',5)]).map(x=>x.count),[1]),
 ()=>assert.deepEqual(g([t('PD',0),t('PD',11)],{gapSeconds:10}).map(x=>x.count),[1,1]),
 ()=>assert.deepEqual(g([t('PD',0,{duration:2}),t('PD',11)],{gapSeconds:10}).map(x=>x.count),[2]),
 ()=>assert.deepEqual(g([t('PD',0,{confidence:.8})]),[]),
 ()=>assert.deepEqual(g([t('PD',0,{evidenceId:'x'}),t('PD',1,{evidenceId:'x'})])[0].evidenceIds,['x']),
 ()=>assert.equal(g([t('BIRD',0)])[0].reviewRequired,true),
 ()=>assert.equal(g([t('seizure',0)])[0].reviewRequired,true),
 ()=>assert.throws(()=>g([t('PD',0,{duration:-1})]),/invalid event/),
 ()=>assert.throws(()=>g([t('PD',0,{confidence:NaN})]),/invalid event/),
 ()=>assert.throws(()=>g([t('PD',0,{evidenceId:''})]),/invalid evidenceId/),
 ()=>assert.throws(()=>g([],{threshold:2}),/invalid options/),
 ()=>assert.deepEqual(g([]),[]),
 ()=>assert.deepEqual(g([t('PD',10),t('PD',0)]).map(x=>x.start),[0]),
];
checks.forEach((fn,i)=>{try{fn()}catch(e){console.error('FAILED check',i+1);throw e}});
console.log('PASS: '+checks.length+' synthetic episode grouping v2 checks');
