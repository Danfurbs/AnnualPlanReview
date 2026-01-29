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
    name: 'Carlisle Engineer',
    workGroupSets: [
      'DBCARTRW', // Carlisle WDM(TRACK)
      'DBCARTRA', // Carlisle SM(TRACK)
      'DBCARTRE', // Carlisle ENG(TRACK)
      'DBCAROTA', // Carlisle SM(OFFTRACK)
      'DBCARLXA', // Carlisle LCM
      'DBCARDPE', // Carlisle ENG(D&P)
      'DBCARSGW', // Carlisle WDM(SIGNALS)
      'DBCARSGA', // Carlisle SM(SIGNALS)
      'DBCARSGC', // Carlisle SM(S&TME)
      'DBCARSGB', // Carlisle West SM(SIGNALS)
      'DBCAROLA', // Carlisle SM(OLE)
      'DBCARDPA', // Carlisle SM(D&P)
    ]
  },
  {
    id: 'preston',
    name: 'Preston Engineer',
    workGroupSets: [
      'DBPRERTA', // Preston SM(RT&L)
      'DBPREOTA', // Preston SM(OFFTRACK)
      'DBPRETRA', // Preston SM(TRACK)
      'DBPRETRE', // Preston ENG(TRACK)
      'DBPRESGW', // Preston WDM(SIGNALS)
      'DBPREWGA', // Preston SM(W&G)
      'DBPREOLA', // Preston SM(OLE)
      'DBPREEPA', // Preston ENG(E&P)
      'DBPREDPA', // Preston SM(D&P)
      'DBPRESGA', // Preston SM(SIGNALS)
      'DBPRESGE', // Preston ENG(SIGNALS)
      'DBPRELXA', // Preston LCM
    ]
  },
  {
    id: 'carnforth',
    name: 'Carnforth Engineer',
    workGroupSets: [
      'DBCANTRA', // Carnforth SM(TRACK)
      'DBCANTRE', // Carnforth ENG(TRACK)
      'DBCANOFT', // Carnforth SM (OFFTRACK)
      'DBCANWGA', // Carnforth SM(W&G)
      'DBCANSGA', // Carnforth & Barrow SM(SIGNALS)
      'DBCANRTA', // Carnforth SM(RT&L)
    ]
  },
  {
    id: 'liverpool',
    name: 'Liverpool Engineer',
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
    ]
  },
  {
    id: 'crewe',
    name: 'Crewe Engineer',
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
    ]
  },
  {
    id: 'piccadilly',
    name: 'Piccadilly Engineer',
    workGroupSets: [
      'DEPICTRA', // Piccadilly SM(TRACK)
      'DECENSGA', // Piccadilly Central SM(SIGNALS)
      'DEPICSGA', // Piccadilly North SM(SIGNALS)
    ]
  },
  {
    id: 'victoria',
    name: 'Victoria Engineer',
    workGroupSets: [
      'DEVICRTA', // Victoria SM(RT&L)
      'DEVICTRA', // Victoria SM(TRACK)
    ]
  },
  {
    id: 'bolton-wigan',
    name: 'Bolton & Wigan Engineer',
    workGroupSets: [
      'DEBOLTRA', // Bolton SM(TRACK)
      'DCWARTRA', // Wigan SM(TRACK)
      'DFWIGOLE', // Wigan WDM (OLE)
    ]
  },
  {
    id: 'stockport',
    name: 'Stockport & Guide Bridge Engineer',
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
    workGroupSets: [
      'DELSTOLA', // Longsight SM(OLE)
      'DELSTDPA', // Longsight SM(D&P)
    ]
  },
  {
    id: 'blackburn',
    name: 'Blackburn Engineer',
    workGroupSets: [
      'DBBLATRA', // Blackburn SM(TRACK)
      'DBBLATRE', // Blackburn ENG(TRACK)
    ]
  },
  {
    id: 'appleby',
    name: 'Appleby Engineer',
    workGroupSets: [
      'DBAPPTRA', // Appleby SM(TRACK)
      'DBAPPTRE', // Appleby ENG(TRACK)
      'DBBARTRA', // Cumbrian Coast SM(TRACK)
    ]
  },
  {
    id: 'telecoms',
    name: 'Telecoms Engineer',
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
    workGroupSets: [
      'DDGFLNWN', // RAM Investment Projects North
    ]
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

// Expose functions globally
window.getEngineers = getEngineers;
window.getEngineerById = getEngineerById;
window.getEngineerWorkGroups = getEngineerWorkGroups;
window.isWorkGroupForEngineer = isWorkGroupForEngineer;
