const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const Module = require('node:module');
const review = require('../../work-order-review');
const originalLoad = Module._load;
const routes = new Map();
Module._load = function(request,...args) {
  if(request==='better-sqlite3')return class {};
  if(request==='pg')return {Pool:class {}};
  if(request==='express')return {Router:()=>Object.fromEntries(['get','post','put'].map(method=>[method,(path,handler)=>routes.set(method+' '+path,handler)]))};
  return originalLoad.call(this,request,...args);
};
const SQLite=require('../services/database');
const PostgreSQL=require('../services/database-pg');
const createRoutes=require('../routes/work-order-amendments');
Module._load=originalLoad;
function fixture() {
  const db=new DatabaseSync(':memory:');
  const service=Object.create(SQLite.prototype);
  service.db={exec:sql=>db.exec(sql),prepare:sql=>db.prepare(sql),transaction:fn=>(...args)=>{
    db.exec('BEGIN');try{const result=fn(...args);db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}
  }};
  service.ensureSchema();service.prepareStatements();createRoutes(service);
  const identity={jobNumber:'000001',number:'WO-A',workGroup:'WG'};
  const id=review.stableId(identity);
  service.updateWorkOrderAmendment(id,{units:9,reason:'Reported in wrong unit',identity,status:'active'},0);
  return {db,service,id,identity};
}
const response=()=>({code:200,body:null,status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
test('resolution persists status and audit together, preserves the correction and other orders',async()=>{
  const f=fixture();
  try {
    f.service.updateWorkOrderAmendment('000002-WO-B-1',{units:3},0);
    const res=response();
    await routes.get('post /reconcile')({body:{items:[{orderId:f.id,identity:f.identity,sourceUnits:9,expectedRevision:1}]}},res);
    assert.equal(res.body.results[0].resolved,true);
    const saved=f.service.getWorkOrderAmendments();
    assert.equal(saved[f.id].status,'resolved');
    assert.equal(saved[f.id].units,9);
    assert.ok(saved[f.id].resolvedAt);
    assert.equal(saved[f.id].reason,'Reported in wrong unit');
    assert.equal(saved['000002-WO-B-1'].units,3);
    const events=f.service.getChangeHistory('000001','FY27').map(row=>({...row,details:JSON.parse(row.details_json)}));
    assert.equal(events.filter(event=>event.details.status==='resolved').length,1);
    assert.match(events.find(event=>event.details.status==='resolved').details.reason,/ELLIPSE/);
  }finally{f.db.close();}
});
test('reconciliation never overwrites a newer correction or retires a different source value',async()=>{
  const f=fixture();
  try {
    f.service.updateWorkOrderAmendment(f.id,{units:12,identity:f.identity,status:'active'},1);
    for(const expectedRevision of [1,2]) {
      const res=response();
      await routes.get('post /reconcile')({body:{items:[{orderId:f.id,identity:f.identity,sourceUnits:9,expectedRevision}]}},res);
      assert.equal(res.body.results[0].resolved,false);
    }
    assert.equal(f.service.getWorkOrderAmendments()[f.id].status,'active');
    assert.equal(f.service.getWorkOrderAmendments()[f.id].units,12);
    assert.equal(f.service.getChangeHistory('000001','FY27').map(row=>({...row,details:JSON.parse(row.details_json)})).filter(event=>event.details.status==='resolved').length,0);
  }finally{f.db.close();}
});
test('resolution route rejects invalid source evidence before writing',async()=>{
  const f=fixture();
  try {
    for(const sourceUnits of [-1,'9',null]) {
      const res=response();
      await routes.get('post /reconcile')({body:{items:[{orderId:f.id,identity:f.identity,sourceUnits,expectedRevision:1}]}},res);
      assert.equal(res.code,400);
    }
    assert.equal(f.service.getWorkOrderAmendments()[f.id].status,'active');
  }finally{f.db.close();}
});

test('a failed audit write rolls back resolution status and revision together',()=>{
  const f=fixture();
  try {
    f.db.exec("CREATE TRIGGER reject_resolution BEFORE INSERT ON change_history WHEN json_extract(NEW.details_json,'$.status') = 'resolved' BEGIN SELECT RAISE(ABORT,'audit failure'); END");
    assert.throws(()=>f.service.updateWorkOrderAmendment(f.id,null,1,{identity:f.identity,sourceUnits:9}),/audit failure/);
    assert.equal(f.service.getWorkOrderAmendments()[f.id].status,'active');
    assert.equal(f.service.getWorkOrderAmendmentRevisions()[f.id],1);
  }finally{f.db.close();}
});

test('PostgreSQL resolution locks, records status and audit, and commits the same transition',async()=>{
  const identity={jobNumber:'000001',number:'WO-A',workGroup:'WG'},id=review.stableId(identity);
  const calls=[];
  let stored, audit, released=false;
  const client={query:async(sql,args)=>{
    calls.push(sql);
    if(sql.includes('SELECT data_json'))return {rows:[{data_json:{[id]:{units:9,status:'active',identity}}}]};
    if(sql.includes('SELECT revision'))return {rows:[{revision:1}]};
    if(sql.startsWith('UPDATE work_order_amendments'))stored=JSON.parse(args[0]);
    if(sql.startsWith('INSERT INTO change_history'))audit=JSON.parse(args[6][0]);
    return {rows:[]};
  },release(){released=true;}};
  const service=Object.create(PostgreSQL.prototype);
  service.ready=Promise.resolve();service.pool={connect:async()=>client};
  assert.equal(await service.updateWorkOrderAmendment(id,null,1,{identity,sourceUnits:9}),2);
  assert.equal(stored[id].status,'resolved');
  assert.equal(audit.status,'resolved');
  assert.ok(calls.some(sql=>sql.includes('FOR UPDATE')));
  assert.equal(calls.at(-1),'COMMIT');
  assert.equal(released,true);
});
