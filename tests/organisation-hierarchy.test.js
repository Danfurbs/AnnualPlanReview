const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function loadHierarchy() {
  const context = { window: {}, console };
  context.globalThis = context.window;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'organisation-data.js'), 'utf8'), context);
  const raw = fs.readFileSync(path.join(__dirname, '..', 'organisation-data.js'), 'utf8')
    .match(/`([\s\S]*?)`/)[1];
  const workGroups = new Map(raw.split('\n').slice(1).map(line => line.split('\t')));
  return { window: context.window, workGroups };
}

test('every active Work Group Set has exactly one Engineer and every Engineer has one DU', () => {
  const { window, workGroups } = loadHierarchy();
  assert.deepEqual(Array.from(window.validateOrganisationHierarchy(workGroups)), []);
});

test('confirmed empty DU remains valid without a placeholder Engineer', () => {
  const { window } = loadHierarchy();
  assert.equal(window.getDeliveryUnitById('west-coast-north').name, 'West Coast North');
  assert.deepEqual(Array.from(window.getEngineersForDeliveryUnit('west-coast-north')), []);
});

test('orphan allocations resolve through the approved Engineer and DU', () => {
  const { window } = loadHierarchy();
  const carlisleSignals = window.getOrganisationForWorkGroup('DBCARSGA');
  assert.equal(carlisleSignals.engineer.id, 'carlisle-st');
  assert.equal(carlisleSignals.deliveryUnit.id, 'lancs-cumbria');

  const atg = window.getOrganisationForWorkGroup('DCATGTRA');
  assert.equal(atg.engineer.id, 'warrington');
  assert.equal(atg.deliveryUnit.id, 'liverpool');
});

test('work groups resolve from codes, descriptions, and combined labels', () => {
  const { window } = loadHierarchy();
  assert.equal(window.resolveWorkGroupCode('DBCANOFT'), 'DBCANOFT');
  assert.equal(window.resolveWorkGroupCode('Carnforth SM Drainage'), 'DBCANOFT');
  assert.equal(window.resolveWorkGroupCode('DBCANOFT Carnforth SM Drainage'), 'DBCANOFT');
  assert.equal(window.getOrganisationForWorkGroup('Carnforth SM Drainage').engineer.id, 'preston');
});

test('Delivery Units resolve from stable IDs and display names', () => {
  const { window } = loadHierarchy();
  assert.equal(window.resolveDeliveryUnit('liverpool').id, 'liverpool');
  assert.equal(window.resolveDeliveryUnit('Lancs and Cumbria').id, 'lancs-cumbria');
  assert.equal(window.resolveDeliveryUnit('unknown'), null);
});

test('comments follow current WGS hierarchy and untagged comments use the approved fallback', () => {
  const { window } = loadHierarchy();
  const bauDeliveryUnit = window.encodeCommentDeliveryUnit('manchester');
  assert.equal(window.getCommentOrganisation({
    filteredWorkGroup: 'DEWDMTRB', deliveryUnit: bauDeliveryUnit
  }).deliveryUnit.id, 'manchester');
  assert.equal(window.getCommentOrganisation({
    filteredWorkGroup: '', deliveryUnit: bauDeliveryUnit
  }).deliveryUnit.id, 'manchester');
});

test('new comments without a WGS use the Delivery Unit selected at entry', () => {
  const { window } = loadHierarchy();
  const comment = {
    filteredWorkGroup: '',
    deliveryUnit: window.encodeCommentDeliveryUnit('liverpool')
  };
  const organisation = window.getCommentOrganisation(comment);
  assert.equal(organisation.deliveryUnit.id, 'liverpool');
  assert.equal(organisation.engineer, null);
});

test('all pre-hierarchy comments receive the one-off Lancs and Cumbria classification', () => {
  const { window } = loadHierarchy();
  const existingLiverpoolComment = {
    filteredWorkGroup: 'DCATGTRA',
    deliveryUnit: 'legacy-liverpool-label',
    filteredEngineerId: 'warrington'
  };
  const organisation = window.getCommentOrganisation(existingLiverpoolComment);
  assert.equal(organisation.deliveryUnit.id, 'lancs-cumbria');
  assert.equal(organisation.engineer, null);
});

test('DU-only comment scope includes all descendant comments and optional filters narrow it', () => {
  const { window } = loadHierarchy();
  const marker = window.encodeCommentDeliveryUnit('liverpool');
  const liverpool = { filteredWorkGroup: 'DCATGTRA', deliveryUnit: marker };
  const crewe = { filteredWorkGroup: 'DCCRETRA', deliveryUnit: marker };
  assert.equal(window.commentMatchesOrganisationScope(liverpool, { deliveryUnitId: 'liverpool' }), true);
  assert.equal(window.commentMatchesOrganisationScope(crewe, { deliveryUnitId: 'liverpool' }), true);
  assert.equal(window.commentMatchesOrganisationScope({ filteredWorkGroup: '' }, {
    deliveryUnitId: 'liverpool'
  }), false);
  assert.equal(window.commentMatchesOrganisationScope(liverpool, {
    deliveryUnitId: 'liverpool', engineerId: 'warrington'
  }), true);
  assert.equal(window.commentMatchesOrganisationScope(liverpool, {
    deliveryUnitId: 'liverpool', engineerId: 'crewe'
  }), false);
  assert.equal(window.commentMatchesOrganisationScope(liverpool, {
    deliveryUnitId: 'liverpool', workGroupCode: 'DCATGTRA'
  }), true);
  assert.equal(window.commentMatchesOrganisationScope(liverpool, {
    deliveryUnitId: 'liverpool', workGroupCode: 'DCCRETRA'
  }), false);
});

test('DU-only standard-job comment scope remains broad across Engineer and WGS selections', () => {
  const { window } = loadHierarchy();
  const marker = window.encodeCommentDeliveryUnit('liverpool');
  const comments = [
    { fy: 'FY27', rf: 'RF3', filteredWorkGroup: 'DCATGTRA', deliveryUnit: marker },
    { fy: 'FY27', rf: 'RF9', filteredWorkGroup: 'DCCRETRA', deliveryUnit: marker }
  ];

  // The breakdown supplies only its DU scope. A page-level Warrington / DCATGTRA
  // selection must therefore leave the Crewe / DCCRETRA RF9 comment visible.
  const visible = comments.filter(comment =>
    comment.fy === 'FY27' && window.commentMatchesOrganisationScope(comment, {
      deliveryUnitId: 'liverpool'
    })
  );

  assert.equal(visible.length, 2);
  assert.deepEqual(Array.from(visible, comment => comment.rf), ['RF3', 'RF9']);
});

test('description-tagged comments remain visible in their current hierarchy', () => {
  const { window } = loadHierarchy();
  const comment = {
    filteredWorkGroup: 'Manchester South ENG(TRACK)',
    deliveryUnit: window.encodeCommentDeliveryUnit('manchester')
  };
  assert.equal(window.getCommentOrganisation(comment).engineer.id, 'manchester');
  assert.equal(window.commentMatchesOrganisationScope(comment, {
    deliveryUnitId: 'manchester', workGroupCode: 'DEMNSTRE'
  }), true);
});
