const test = require('node:test');
const assert = require('node:assert/strict');
const otm = require('../otm-forecast');
const model = require('../forecast-model');
const waif = require('../waif-forecast-import');
const builder = require('../forecast-builder-actions');
const periods = value => Object.fromEntries(model.periods.map(p => [p,value]));
const options = { engineerId:'eng-a',workGroups:['A','B'],resolve:v=>v==='Old A'?'A':v };
const plan = changes => ({jobNumber:'009112',enabled:true,workGroup:'A',rate:.5,shifts:periods(2),...changes});
const original = () => new Map([['009112',{wgs:{A:periods(9),B:{P1:3},OTHER:{P1:99}},comments:{A:'Keep this',OTHER:'Other Engineer'}}]]);

test('OTM calculation keeps fractions, explicit zero and precision, and rejects missing/invalid inputs',()=>{
 assert.equal(otm.outputs(plan()).P1,1);
 assert.equal(otm.outputs(plan({rate:.333333333,shifts:periods(1)})).P1,.333333);
 assert.equal(otm.outputs(plan({shifts:periods(0)})).P1,0);
 for(const p of [plan({rate:null}),plan({rate:-1}),plan({rate:Infinity}),plan({shifts:{P1:2}}),plan({shifts:periods(-1)}),plan({rate:1e308,shifts:periods(3)})])assert.throws(()=>otm.outputs(p));
});
test('apply overwrites selected WG periods, retains other Engineers/jobs/comments, and never mutates the source',()=>{
 const before=original(),out=otm.apply(before,[plan()],options),job=out.get('009112');
 assert.deepEqual(job.wgs.A,periods(1));assert.equal(job.wgs.OTHER.P1,99);assert.equal(job.wgs.B.P1,3);
 assert.equal(job.comments.A,'Keep this');assert.equal(job.periods.P1,103);assert.equal(before.get('009112').wgs.A.P1,9);
 assert.equal(job.sources.A.otmPlan.rate,.5);assert.equal(job.sources.A.mst.P1,9);
 assert.equal(otm.validateEvidence(job.sources.A),null);
 assert.throws(()=>otm.apply(before,[plan({workGroup:'OTHER'})],options),/owned/);
 assert.throws(()=>otm.apply(before,[plan({jobNumber:'009144'})],options),/Standard Job/);
});
test('MST and WAIF imports refresh evidence but cannot replace positive or explicit-zero OTM outputs, in either order',()=>{
 const items=value=>[{jobNumber:'009112',workGroup:'A',period:'P1',value}];
 for(const zero of [false,true]){
  const p=plan({shifts:periods(zero?0:2)});
  let a=otm.apply(new Map(),[p],options);
  a=waif.patchSnapshot(a,items(12),{source:'mst'}).data;a=waif.patchSnapshot(a,items(20)).data;
  let b=waif.patchSnapshot(new Map(),items(20)).data;b=waif.patchSnapshot(b,items(12),{source:'mst'}).data;b=otm.apply(b,[p],options);
  assert.equal(a.get('009112').wgs.A.P1,zero?0:1);assert.deepEqual(a.get('009112').wgs,b.get('009112').wgs);
  assert.equal(a.get('009112').sources.A.mst.P1,12);assert.equal(a.get('009112').sources.A.waif.P1,20);
  assert.deepEqual(waif.patchSnapshot(a,items(20)).data,a);
 }
});
test('reapplication is idempotent and moving/removing allocation restores refreshed sources without double counting',()=>{
 const initial=otm.apply(original(),[plan()],options);
 assert.deepEqual(otm.apply(initial,[plan()],options),initial);
 const refreshed=waif.patchSnapshot(initial,[{jobNumber:'009112',workGroup:'A',period:'P1',value:14}],{source:'mst'}).data;
 const moved=otm.apply(refreshed,[plan({workGroup:'B'})],options).get('009112');
 assert.equal(moved.wgs.A.P1,14);assert.equal(moved.sources.A.otm,undefined);assert.equal(moved.wgs.B.P1,1);
 const released=otm.apply(new Map([['009112',moved]]),[plan({enabled:false})],options).get('009112');
 assert.equal(released.wgs.B.P1,3);assert.equal(released.sources.B.otmPlan,undefined);assert.equal(released.wgs.OTHER.P1,99);
});
test('previous manual adjustments including zero survive apply, repeat and release',()=>{
 let data=waif.patchSnapshot(new Map(),[{jobNumber:'009112',workGroup:'A',period:'P1',value:5}]).data;
 data.get('009112').wgs.A.P1=0;
 data=otm.apply(data,[plan()],options);
 assert.equal(data.get('009112').sources.A.otmManual.P1,0);
 data=otm.apply(data,[plan({rate:2})],options);
 assert.equal(data.get('009112').sources.A.otmManual.P1,0);
 data=otm.apply(data,[plan({enabled:false})],options);assert.equal(data.get('009112').wgs.A.P1,0);
});
test('ownership scoping, aliases and backup restoration retain OTM inputs and validate derived outputs',()=>{
 const data=otm.apply(new Map([['9112',{wgs:{'Old A':periods(9)}}]]),[plan()],options);
 assert.deepEqual(Object.keys(data.get('9112').wgs),['A']);
 assert.equal(otm.plans(data,['A'],options.resolve)[0].enabled,true);assert.equal(otm.plans(data,['OTHER'])[0].enabled,false);
 const target=new Map([['009112',{wgs:{A:periods(1)}}]]);waif.restoreSources(target,data,options.resolve);
 assert.deepEqual(target.get('009112').sources.A.otmPlan.shifts,periods(2));
 data.get('9112').sources.A.otm.P1=99;assert.throws(()=>waif.restoreSources(target,data),/match saved/);
});
test('generic V0 edits/profile copies cannot overwrite OTM-derived periods, but comments remain editable',()=>{
 const job=otm.apply(original(),[plan()],options).get('009112');
 const draft={rows:{A:{periods:periods(999),comment:'Updated'}},clearedWorkGroups:new Set()};
 assert.equal(builder.mergeDraft(job,draft).wgs.A.P1,1);
 const result=builder.mergeDraftChanges(job,job,draft,v=>v).job;
 assert.equal(result.wgs.A.P1,1);assert.equal(result.comments.A,'Updated');
});
test('shift import validates all rows, rejects duplicates/foreign jobs, and distinguishes blank from zero',()=>{
 const parsed=otm.parseRows([{sjn:9112,period:'P01',shifts:0},{sjn:'009113',period:13,shifts:''}]);
 assert.equal(parsed[0].shifts,0);assert.equal(parsed[1].shifts,undefined);
 for(const rows of [[{sjn:9112,period:1,shifts:2},{sjn:9112,period:1,shifts:3}],[{sjn:9144,period:1,shifts:3}],[{sjn:9112,period:14,shifts:3}],[{sjn:9112,period:1,shifts:-1}]])assert.throws(()=>otm.parseRows(rows));
});
