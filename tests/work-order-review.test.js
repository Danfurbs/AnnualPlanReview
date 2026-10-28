const test = require('node:test');
const assert = require('node:assert/strict');
const review = require('../work-order-review');
function upload(rows) {
  return new Map([['000001', { workOrders: rows.map(([number, originalUnits, workGroup = 'WG']) => ({ jobNumber: '000001', number, originalUnits, units: originalUnits, workGroup, period: 'P1' })) }]]);
}
const id = review.stableId({jobNumber:'000001',number:'WO-A',workGroup:'WG'});
test('stable order matching survives row reorder and legacy row-index changes', () => {
  const saved = {'000001-WO-A-1':{units:9}};
  const data = upload([['WO-B',5],['WO-A',0]]);
  review.apply(data,saved);
  const order = data.get('000001').workOrders[1];
  assert.equal(order.id,id);
  assert.equal(order.units,9);
  assert.equal(order.correctionId,'000001-WO-A-1');
  assert.equal(order.correctionStatus,'active');
});
test('only fresh matching source proposes resolution; resolved values never override later uploads', () => {
  const saved = {[id]:{units:9,status:'active'}};
  const fresh = upload([['WO-A',9]]);
  const [evidence] = review.proposals(fresh,saved);
  assert.equal(evidence.sourceUnits,9);
  saved[id]=review.resolvedValue(id,saved[id],evidence);
  review.apply(fresh,saved);
  assert.equal(fresh.get('000001').workOrders[0].correctionResolved,true);
  assert.equal(fresh.get('000001').workOrders[0].isAmended,false);
  const later = upload([['WO-A',12]]);
  review.apply(later,saved);
  assert.equal(later.get('000001').workOrders[0].units,12);
  assert.equal(later.get('000001').workOrders[0].correctionStatus,'resolved');
  assert.equal(review.proposals(later,saved).length,0);
});
test('zero confirmation is valid; missing, different, duplicate and ambiguous rows never resolve', () => {
  const saved = {[id]:{units:0}};
  assert.equal(review.proposals(upload([['WO-A',0]]),saved).length,1);
  for(const data of [upload([['WO-B',0]]),upload([['WO-A',5]]),upload([['WO-A',0],['WO-A',0]])]) assert.equal(review.proposals(data,saved).length,0);
  const twoGroups = upload([['WO-A',0,'WG'],['WO-A',0,'OTHER']]);
  assert.equal(review.proposals(twoGroups,{'000001-WO-A-1':{units:0}}).length,0);
  review.apply(twoGroups,{'000001-WO-A-1':{units:7}});
  assert.equal(twoGroups.get('000001').workOrders[0].units,0);
  assert.match(twoGroups.get('000001').workOrders[0].correctionMatchIssue,/uniquely/);
});
test('resolution checks target identity and value rather than accepting a stale proposal', () => {
  const evidence={identity:{jobNumber:'000001',number:'WO-A',workGroup:'WG'},sourceUnits:9};
  assert.throws(()=>review.resolvedValue(id,{units:12},evidence),{code:'RECONCILIATION_MISMATCH'});
  assert.throws(()=>review.resolvedValue('000001-OTHER-1',{units:9},evidence),{code:'RECONCILIATION_MISMATCH'});
  assert.throws(()=>review.resolvedValue(id,{units:9,identity:{...evidence.identity,workGroup:'OTHER'}},evidence),{code:'RECONCILIATION_MISMATCH'});
});
test('an already loaded source is marked stale if another session retires its active override', () => {
  const saved={[id]:{units:9}};
  const older=upload([['WO-A',0]]);
  review.apply(older,saved);
  saved[id]={units:9,status:'resolved'};
  review.apply(older,saved);
  assert.equal(older.get('000001').workOrders[0].correctionSourceStale,true);
  const fresh=upload([['WO-A',9]]);
  review.apply(fresh,saved);
  assert.equal(fresh.get('000001').workOrders[0].correctionSourceStale,false);
});
