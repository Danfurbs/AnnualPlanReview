/**
 * Canonical DU → Engineer → Work Group Set reference data.
 * This is the single source of truth for descriptions, ownership, filters,
 * forecast reporting assignments, and comment classification.
 */
const WORK_GROUP_SETS_RAW = `Work Group Set	Set Description
DBAPPTRA	Appleby SM(TRACK)
DBAPPTRE	Appleby ENG(TRACK)
DBBARTRA	Cumbrian Coast SM(TRACK)
DBCARTRW	Carlisle WDM(TRACK)
DBCANTRA	Carnforth SM(TRACK)
DBCANTRE	Carnforth ENG(TRACK)
DBCARTRA	Carlisle SM(TRACK)
DBCARTRE	Carlisle ENG(TRACK)
DBPRERTA	Preston SM(RT&L)
DBCANOFT	Carnforth SM (OFFTRACK)
DBCANWGA	Carnforth SM(W&G)
DBCAROTA	Carlisle SM(OFFTRACK)
DBCARLXA	Carlisle LCM
DBPRELXA	Preston LCM
DBCARDPE	Carlisle ENG(D&P)
DBCANSGA	Carnforth & Barrow SM(SIGNALS)
DBCARSGW	Carlisle WDM(SIGNALS)
DBCARSGA	Carlisle SM(SIGNALS)
DBCARSGC	Carlisle SM(S&TME)
DBCARSGB	Carlisle West SM(SIGNALS)
DBCANRTA	Carnforth SM(RT&L)
DCCHETRA	Chester SM(TRACK)
DCCHETRE	Liverpool ENG(TRACK)
DCCRETRC	CREWE RME
DCCHERTA	Liverpool SM(RT&L)
DCMERTRE	Merseyside ENG(TRACK)
DCCHEOTA	Liverpool SM(OFFTRACK)
DCTUBOTA	Warrington SM(OFFTRACK)
DCLIVWGA	RETIRED - DO NOT USE
DCCHELXA	Liverpool LCM
DCCRELXA	Warrington LCM
DCMERDPC	Liverpool SM (SIGELP)
DCNORDPC	NORTHWICH SM(SIGELP)
DCLIVMDM	Liverpool IMDM Work
DCCHESGA	Liverpool SM(SIGNALS)
DCMRNSGE	Merseyside ENG(SIGNALS)
DCCHESGW	Liverpool WDM(SIGNALS)
DCCHETRW	Liverpool WDM(TRACK)
DCCRETRR	Crewe North SM (RBM TRACK)
DCCRETRA	Crewe SM(TRACK)
DCCRETRB	Crewe South SM(TRACK)
DCCRETRE	Crewe ENG(TRACK)
DCEDHTRA	Edge Hill SM(TRACK)
DCWARTRA	Wigan SM(TRACK)
DCWBQTRA	Warrington SM(TRACK)
DCWBQTRE	Warrington ENG(TRACK)
DCEDHWGA	Liverpool SM(W&G)
DCATGTRA	Warrington ENG(ATG)
DCCREOLA	Warrington SM(OLE)
DCCREOLE	Warrington ENG(OLE)
DCCRESGA	Crewe SM(SIGNALS)
DCCRESGE	Warrington ENG(SIGNALS)
DCWBQSGA	Warrington SM(SIGNALS)
DCCRERTA	Crewe SM(RT&L)
DCWORSGA	Warrington WDM(SIGNALS)
DCTUBTRA	Warrington WDM(TRACK)
DEMNNOTA	Manchester SM(OFFTRACK)
DEBOLTRA	Bolton SM(TRACK)
DEMNNTRE	Manchester North ENG(TRACK)
DEWDMTRA	Manchester WDM(TRACK)
DEMNETRE	Manchester East ENG(TRACK)
DECHITRA	Chinley SM(TRACK)
DEGUBTRA	Guide Bridge SM(TRACK)
DEGUBWGA	Guide Bridge SM(W&G)
DEVICRTA	Victoria SM(RT&L)
DEPICTRA	Piccadilly SM(TRACK)
DEMNSTRE	Manchester South ENG(TRACK)
DEVICTRA	Victoria SM(TRACK)
DEWDMTRB	NW&C WD S&C Re Ballasting
DEWIMTRA	Wilmslow SM(TRACK)
DEMNNLXA	Manchester LCM
DELSTOLA	Longsight SM(OLE)
DEMNNOLB	Manchester AENG(OLE)
DELSTDPA	Longsight SM(D&P)
DEROCSGA	Manchester S&T ROC
DECENSGA	Piccadilly Central SM(SIGNALS)
DEPICSGA	Piccadilly North SM(SIGNALS)
DESTOSGB	Stockport SM(SIGNALS)
DEMNNSGA	Manchester AENG(SIGNALS)
DESTOSGA	Manchester WDM(SIGNALS)
DBPREOTA	Preston SM(OFFTRACK)
DBBLATRA	Blackburn SM(TRACK)
DBBLATRE	Blackburn ENG(TRACK)
DBPRETRA	Preston SM(TRACK)
DBPRETRE	Preston ENG(TRACK)
DBPRESGW	Preston WDM(SIGNALS)
DBPREWGA	Preston SM(W&G)
DBCAROLA	Carlisle SM(OLE)
DBPREOLA	Preston SM(OLE)
DBPREEPA	Preston ENG(E&P)
DBCARDPA	Carlisle SM(D&P)
DBPREDPA	Preston SM(D&P)
DBPRESGA	Preston SM(SIGNALS)
DBPRESGE	Preston ENG(SIGNALS)
DTPRETCA	Preston/Carlisle Telecoms
DFWIGOLE	Wigan WDM (OLE)
DDGFLNWN	RAM Investment Projects North
DCMRNTRA	Merseyside SM(TRACK)
DCMERCRA	Liverpool SM(CRE)
DCMERDPA	Liverpool SM(PLANT)
DCMERDPB	Liverpool SM(DISTRIBUTION)
DCMRNSGA	Merseyside SM(SIGNALS)
DTWARTCA	Crewe/Warrington Telecoms
DTLVRTCA	Liverpool Telecoms
DTSTOTCA	Manchester Telecoms
DTRGNTCA	Riggers NW Telecoms
DTRGSTCA	Riggers WM & South Telecoms`;

/**
 * Engineer Data
 * Defines engineers and their associated work group sets
 *
 * Each engineer has:
 * - id: Unique identifier
 * - name: Display name
 * - workGroupSets: Array of work group set codes this engineer is responsible for
 */

const ENGINEERS_DATA = [
  {
    id: 'carlisle',
    name: 'Carlisle Track',
    deliveryUnitId: 'lancs-cumbria',
    workGroupSets: [

      'DBCARTRA', // Carlisle SM(TRACK)
      'DBCARTRE', // Carlisle ENG(TRACK)
      'DBCARLXA', // Carlisle LCM
'DBPRERTA', // Preston SM(RT&L)
      'DBPREWGA', // Preston SM(W&G)
      'DBPRELXA', // Preston LCM
      'DBCANWGA', // Carnforth SM(W&G)
      'DBCARTRW', // Carlisle WDM(TRACK)
    ]
  },
  {
    id: 'preston',
    name: 'Preston Track',
    deliveryUnitId: 'lancs-cumbria',
    workGroupSets: [

      'DBCANOFT', // Carnforth SM (OFFTRACK)
      'DBPRETRA', // Preston SM(TRACK)
      'DBPRETRE', // Preston ENG(TRACK)

    ]
  },
  {
    id: 'carnforth',
    name: 'Carnforth Track',
    deliveryUnitId: 'lancs-cumbria',
    workGroupSets: [
      'DBCANTRA', // Carnforth SM(TRACK)
      'DBCANTRE', // Carnforth ENG(TRACK)
      'DBCAROTA', // Carlisle SM (OFFTRACK)
      'DBCANRTA', // Carnforth SM(RT&L)
    ]
  },
  {
    id: 'liverpool',
    name: 'Liverpool Engineer',
    deliveryUnitId: 'liverpool',
    workGroupSets: [
      'DCCHETRA', // Chester SM(TRACK)
      'DCCHETRE', // Liverpool ENG(TRACK)
      'DCCHERTA', // Liverpool SM(RT&L)
      'DCCHEOTA', // Liverpool SM(OFFTRACK)
      'DCCHELXA', // Liverpool LCM
      'DCMERDPC', // Liverpool SM (SIGELP)
      'DCLIVMDM', // Liverpool IMDM Work
      'DCCHESGA', // Liverpool SM(SIGNALS)
      'DCCHESGW', // Liverpool WDM(SIGNALS)
      'DCCHETRW', // Liverpool WDM(TRACK)
      'DCEDHTRA', // Edge Hill SM(TRACK)
      'DCEDHWGA', // Liverpool SM(W&G)
    ]
  },
  {
    id: 'merseyside',
    name: 'Merseyside Engineer',
    deliveryUnitId: 'liverpool',
    workGroupSets: [
      'DCMERTRE', // Merseyside ENG(TRACK)
      'DCMRNSGE', // Merseyside ENG(SIGNALS)
      'DCMRNTRA', // Merseyside SM(TRACK)
      'DCMERCRA', // Liverpool SM(CRE)
      'DCMERDPA', // Liverpool SM(PLANT)
      'DCMERDPB', // Liverpool SM(DISTRIBUTION)
      'DCMRNSGA', // Merseyside SM(SIGNALS)
    ]
  },
  {
    id: 'warrington',
    name: 'Warrington Engineer',
    deliveryUnitId: 'liverpool',
    workGroupSets: [
      'DCTUBOTA', // Warrington SM(OFFTRACK)
      'DCCRELXA', // Warrington LCM
      'DCNORDPC', // NORTHWICH SM(SIGELP)
      'DCWBQTRA', // Warrington SM(TRACK)
      'DCWBQTRE', // Warrington ENG(TRACK)
      'DCCREOLA', // Warrington SM(OLE)
      'DCCREOLE', // Warrington ENG(OLE)
      'DCCRESGE', // Warrington ENG(SIGNALS)
      'DCWBQSGA', // Warrington SM(SIGNALS)
      'DCWORSGA', // Warrington WDM(SIGNALS)
      'DCTUBTRA', // Warrington WDM(TRACK)
      'DCATGTRA', // Warrington ENG(ATG)
    ]
  },
  {
    id: 'crewe',
    name: 'Crewe Engineer',
    deliveryUnitId: 'liverpool',
    workGroupSets: [
      'DCCRETRC', // CREWE RME
      'DCCRETRR', // Crewe North SM (RBM TRACK)
      'DCCRETRA', // Crewe SM(TRACK)
      'DCCRETRB', // Crewe South SM(TRACK)
      'DCCRETRE', // Crewe ENG(TRACK)
      'DCCRESGA', // Crewe SM(SIGNALS)
      'DCCRERTA', // Crewe SM(RT&L)
    ]
  },
  {
    id: 'manchester',
    name: 'Manchester Engineer',
    deliveryUnitId: 'manchester',
    workGroupSets: [
      'DEMNNOTA', // Manchester SM(OFFTRACK)
      'DEMNNTRE', // Manchester North ENG(TRACK)
      'DEWDMTRA', // Manchester WDM(TRACK)
      'DEMNETRE', // Manchester East ENG(TRACK)
      'DEMNSTRE', // Manchester South ENG(TRACK)
      'DEMNNLXA', // Manchester LCM
      'DEMNNOLB', // Manchester AENG(OLE)
      'DEROCSGA', // Manchester S&T ROC
      'DEMNNSGA', // Manchester AENG(SIGNALS)
      'DEWDMTRB', // NW&C WD S&C Re Ballasting
    ]
  },
  {
    id: 'piccadilly',
    name: 'Piccadilly Engineer',
    deliveryUnitId: 'manchester',
    workGroupSets: [
      'DEPICTRA', // Piccadilly SM(TRACK)
      'DECENSGA', // Piccadilly Central SM(SIGNALS)
      'DEPICSGA', // Piccadilly North SM(SIGNALS)
    ]
  },
  {
    id: 'victoria',
    name: 'Victoria Engineer',
    deliveryUnitId: 'manchester',
    workGroupSets: [
      'DEVICRTA', // Victoria SM(RT&L)
      'DEVICTRA', // Victoria SM(TRACK)
    ]
  },
  {
    id: 'bolton-wigan',
    name: 'Bolton & Wigan Engineer',
    deliveryUnitId: 'manchester',
    workGroupSets: [
      'DEBOLTRA', // Bolton SM(TRACK)
      'DCWARTRA', // Wigan SM(TRACK)
      'DFWIGOLE', // Wigan WDM (OLE)
    ]
  },
  {
    id: 'stockport',
    name: 'Stockport & Guide Bridge Engineer',
    deliveryUnitId: 'manchester',
    workGroupSets: [
      'DECHITRA', // Chinley SM(TRACK)
      'DEGUBTRA', // Guide Bridge SM(TRACK)
      'DEGUBWGA', // Guide Bridge SM(W&G)
      'DEWIMTRA', // Wilmslow SM(TRACK)
      'DESTOSGB', // Stockport SM(SIGNALS)
      'DESTOSGA', // Manchester WDM(SIGNALS)
    ]
  },
  {
    id: 'longsight',
    name: 'Longsight Engineer',
    deliveryUnitId: 'manchester',
    workGroupSets: [
      'DELSTOLA', // Longsight SM(OLE)
      'DELSTDPA', // Longsight SM(D&P)
    ]
  },
  {
    id: 'blackburn',
    name: 'Blackburn Track',
    deliveryUnitId: 'lancs-cumbria',
    workGroupSets: [
      'DBBLATRA', // Blackburn SM(TRACK)
      'DBBLATRE', // Blackburn ENG(TRACK)
     'DBPREOTA', // Preston SM(OFFTRACK)
    ]
  },
  {
    id: 'appleby',
    name: 'Appleby Track',
    deliveryUnitId: 'lancs-cumbria',
    workGroupSets: [
      'DBAPPTRA', // Appleby SM(TRACK)
      'DBAPPTRE', // Appleby ENG(TRACK)
      'DBBARTRA', // Cumbrian Coast SM(TRACK)
    ]
  },
  {
    id: 'telecoms',
    name: 'Telecoms Engineer',
    deliveryUnitId: 'telecoms',
    workGroupSets: [
      'DTPRETCA', // Preston/Carlisle Telecoms
      'DTWARTCA', // Crewe/Warrington Telecoms
      'DTLVRTCA', // Liverpool Telecoms
      'DTSTOTCA', // Manchester Telecoms
      'DTRGNTCA', // Riggers NW Telecoms
      'DTRGSTCA', // Riggers WM & South Telecoms
    ]
  },
  {
    id: 'investment',
    name: 'Investment Projects',
    deliveryUnitId: 'investment-projects',
    workGroupSets: [
      'DDGFLNWN', // RAM Investment Projects North
    ]
  },
  {
    id: 'carlisle-st',
    name: 'Carlisle S&T',
    deliveryUnitId: 'lancs-cumbria',
    workGroupSets: ['DBCARSGW', 'DBCARSGA', 'DBCARSGC', 'DBCARSGB']
  },
  {
    id: 'carnforth-st',
    name: 'Carnforth S&T',
    deliveryUnitId: 'lancs-cumbria',
    workGroupSets: ['DBCANSGA']
  },
  {
    id: 'preston-st',
    name: 'Preston S&T',
    deliveryUnitId: 'lancs-cumbria',
    workGroupSets: ['DBPRESGW', 'DBPRESGA', 'DBPRESGE']
  },
  {
    id: 'lc-ep',
    name: 'L&C E&P Engineer',
    deliveryUnitId: 'lancs-cumbria',
    workGroupSets: ['DBCARDPE', 'DBCAROLA', 'DBPREOLA', 'DBPREEPA', 'DBCARDPA', 'DBPREDPA']
  },
];

// Expose globally
window.ENGINEERS_DATA = ENGINEERS_DATA;

/**
 * Get all engineers
 * @returns {Array} List of engineer objects
 */
function getEngineers() {
  return window.ENGINEERS_DATA || [];
}

/**
 * Get engineer by ID
 * @param {string} id - Engineer ID
 * @returns {Object|null} Engineer object or null
 */
function getEngineerById(id) {
  return getEngineers().find(eng => eng.id === id) || null;
}

/**
 * Get all work group sets for an engineer
 * @param {string} engineerId - Engineer ID
 * @returns {Array} List of work group set codes
 */
function getEngineerWorkGroups(engineerId) {
  const engineer = getEngineerById(engineerId);
  return engineer ? engineer.workGroupSets : [];
}

/**
 * Check if a work group belongs to an engineer
 * @param {string} workGroupCode - Work group set code
 * @param {string} engineerId - Engineer ID
 * @returns {boolean}
 */
function isWorkGroupForEngineer(workGroupCode, engineerId) {
  const workGroups = getEngineerWorkGroups(engineerId);
  return workGroups.includes(workGroupCode);
}

/**
 * Find which engineer a work group belongs to
 * @param {string} workGroupCode - Work group set code
 * @returns {Object|null} Engineer object or null if not found
 */
function getEngineerForWorkGroup(workGroupCode) {
  if (!workGroupCode) return null;
  const code = workGroupCode.trim().toUpperCase();
  return getEngineers().find(eng =>
    eng.workGroupSets.some(wg => wg.toUpperCase() === code)
  ) || null;
}

// Expose functions globally
window.getEngineers = getEngineers;
window.getEngineerById = getEngineerById;
window.getEngineerWorkGroups = getEngineerWorkGroups;
window.isWorkGroupForEngineer = isWorkGroupForEngineer;
window.getEngineerForWorkGroup = getEngineerForWorkGroup;

const DELIVERY_UNITS_DATA = [
  { id: 'lancs-cumbria', name: 'Lancs and Cumbria', active: true },
  { id: 'liverpool', name: 'Liverpool', active: true },
  { id: 'manchester', name: 'Manchester', active: true },
  { id: 'west-coast-north', name: 'West Coast North', active: true },
  { id: 'telecoms', name: 'Telecoms', active: true },
  { id: 'investment-projects', name: 'Investment Projects', active: true }
];

const DEFAULT_COMMENT_DELIVERY_UNIT_ID = 'lancs-cumbria';

function getDeliveryUnits() {
  return (globalThis.DELIVERY_UNITS_DATA || DELIVERY_UNITS_DATA).filter(unit => unit.active !== false);
}

function getDeliveryUnitById(id) {
  return getDeliveryUnits().find(unit => unit.id === id) || null;
}

function getEngineersForDeliveryUnit(deliveryUnitId) {
  const engineers = typeof globalThis.getEngineers === 'function' ? globalThis.getEngineers() : [];
  return engineers.filter(engineer => engineer.deliveryUnitId === deliveryUnitId);
}

function getDeliveryUnitWorkGroups(deliveryUnitId) {
  return getEngineersForDeliveryUnit(deliveryUnitId).flatMap(engineer => engineer.workGroupSets || []);
}

function getOrganisationForWorkGroup(workGroupCode) {
  const engineer = typeof globalThis.getEngineerForWorkGroup === 'function'
    ? globalThis.getEngineerForWorkGroup(workGroupCode)
    : null;
  return { engineer, deliveryUnit: engineer ? getDeliveryUnitById(engineer.deliveryUnitId) : null };
}

function getCommentOrganisation(comment) {
  const workGroup = String(comment?.filteredWorkGroup || '').trim();
  if (workGroup) return getOrganisationForWorkGroup(workGroup);
  return { engineer: null, deliveryUnit: getDeliveryUnitById(DEFAULT_COMMENT_DELIVERY_UNIT_ID) };
}

/**
 * Resolve comment visibility through the canonical hierarchy. A DU-only scope
 * returns every comment classified to that DU; Engineer and WGS are optional
 * descendant filters. Stored legacy labels never determine current ownership.
 */
function commentMatchesOrganisationScope(comment, scope = {}) {
  const organisation = getCommentOrganisation(comment);
  const deliveryUnitId = scope.deliveryUnitId || 'all';
  const engineerId = scope.engineerId || 'all';
  const workGroupCode = String(scope.workGroupCode || 'all').trim().toUpperCase();
  const commentWorkGroup = String(comment?.filteredWorkGroup || '').trim().toUpperCase();
  if (deliveryUnitId !== 'all' && organisation.deliveryUnit?.id !== deliveryUnitId) return false;
  if (engineerId !== 'all' && organisation.engineer?.id !== engineerId) return false;
  return workGroupCode === 'ALL' || commentWorkGroup === workGroupCode;
}

function validateOrganisationHierarchy(workGroupSets) {
  const errors = [];
  const catalogueCodes = workGroupSets
    ? new Set(Array.from(workGroupSets.keys(), code => String(code).trim().toUpperCase()))
    : null;
  const unitIds = new Set();
  getDeliveryUnits().forEach(unit => {
    if (unitIds.has(unit.id)) errors.push(`Duplicate Delivery Unit ID: ${unit.id}`);
    unitIds.add(unit.id);
  });

  const engineers = typeof globalThis.getEngineers === 'function' ? globalThis.getEngineers() : [];
  const engineerIds = new Set();
  const owners = new Map();
  engineers.forEach(engineer => {
    if (engineerIds.has(engineer.id)) errors.push(`Duplicate Engineer ID: ${engineer.id}`);
    engineerIds.add(engineer.id);
    if (!unitIds.has(engineer.deliveryUnitId)) errors.push(`Engineer ${engineer.id} has unknown Delivery Unit`);
    (engineer.workGroupSets || []).forEach(code => {
      const normalized = String(code).trim().toUpperCase();
      if (catalogueCodes && !catalogueCodes.has(normalized)) {
        errors.push(`Engineer ${engineer.id} has unknown Work Group Set ${normalized}`);
      }
      if (owners.has(normalized)) errors.push(`Work Group Set ${normalized} has multiple Engineers`);
      owners.set(normalized, engineer.id);
    });
  });

  if (workGroupSets) {
    workGroupSets.forEach((description, code) => {
      if (!/RETIRED|DO NOT USE/i.test(description) && !owners.has(String(code).trim().toUpperCase())) {
        errors.push(`Active Work Group Set ${code} has no Engineer`);
      }
    });
  }
  return errors;
}

Object.assign(globalThis, {
  DELIVERY_UNITS_DATA,
  DEFAULT_COMMENT_DELIVERY_UNIT_ID,
  getDeliveryUnits,
  getDeliveryUnitById,
  getEngineersForDeliveryUnit,
  getDeliveryUnitWorkGroups,
  getOrganisationForWorkGroup,
  getCommentOrganisation,
  commentMatchesOrganisationScope,
  validateOrganisationHierarchy
});

if (typeof module !== 'undefined') module.exports = {
  DELIVERY_UNITS_DATA,
  DEFAULT_COMMENT_DELIVERY_UNIT_ID,
  getDeliveryUnits,
  getDeliveryUnitById,
  getEngineersForDeliveryUnit,
  getDeliveryUnitWorkGroups,
  getOrganisationForWorkGroup,
  getCommentOrganisation,
  commentMatchesOrganisationScope,
  validateOrganisationHierarchy
};
