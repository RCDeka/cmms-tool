// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Fictional reference data for the mock dataset (docs/data-model.md → Seed data).

const floors = (from, to) => {
  const out = [];
  for (let i = from; i <= to; i++) out.push(i < 0 ? `B${-i}` : `L${i}`);
  return out;
};

/**
 * Place code of a floor (D82): `01` for the first basement, `10` for the ground floor, `11` for
 * L1 and so on, so the codes sort like the floors.
 */
export const floorCode = (floor) =>
  floor.startsWith('B') ? floor.slice(1).padStart(2, '0') : String(10 + Number(floor.slice(1)));

/**
 * The demo sites with their buildings and floors (the location tree, D82). Codes on the sites,
 * and on the buildings and floors of the headquarters and the data center.
 */
export const SITES = [
  {
    name: 'Paris La Défense Headquarters',
    code: 'PAR',
    weight: 40,
    isDataCenter: false,
    buildings: [
      { name: 'Tower A', code: '1', floors: floors(-2, 30) },
      { name: 'Tower B', code: '2', floors: floors(-1, 18) },
    ],
  },
  {
    name: 'Saclay Data Center',
    code: 'SAC',
    weight: 25,
    isDataCenter: true,
    buildings: [
      { name: 'Hall DC1', code: '1', floors: floors(0, 1) },
      { name: 'Hall DC2', code: '2', floors: floors(0, 1) },
      { name: 'Utility building', code: '3', floors: floors(-1, 0) },
    ],
  },
  {
    name: 'Lyon Part-Dieu Branch',
    code: 'LYS',
    weight: 12,
    isDataCenter: false,
    buildings: [{ name: 'Main building', floors: floors(-1, 2) }],
  },
  {
    name: 'Marseille Prado Branch',
    code: 'MRS',
    weight: 12,
    isDataCenter: false,
    buildings: [{ name: 'Main building', floors: floors(0, 1) }],
  },
  {
    name: 'Lille Grand Place Branch',
    code: 'LIL',
    weight: 11,
    isDataCenter: false,
    buildings: [{ name: 'Main building', floors: floors(-1, 1) }],
  },
];

/**
 * Per category: weight in the asset mix, subcategories (with brands and a model prefix),
 * typical exact locations, and symptoms used in corrective work order titles.
 * `where`: 'dc' = data center only, 'office' = other sites only, absent = anywhere.
 */
export const CATEGORIES = {
  HVAC: {
    weight: 30,
    subcategories: [
      { name: 'Air handling unit', brands: ['Carrier', 'Trane', 'Daikin', 'CIAT'], model: 'AHU' },
      {
        name: 'Fan coil unit',
        brands: ['Carrier', 'Daikin', 'Aermec'],
        model: 'FCU',
        where: 'office',
      },
      { name: 'Chiller', brands: ['Trane', 'Carrier', 'York'], model: 'CH' },
      { name: 'Heat pump', brands: ['Daikin', 'Mitsubishi Electric', 'Atlantic'], model: 'HP' },
      {
        name: 'Precision air conditioner',
        brands: ['Vertiv', 'Stulz', 'Schneider Electric'],
        model: 'CRAC',
        where: 'dc',
      },
      { name: 'Extract fan', brands: ['Systemair', 'Ziehl-Abegg', 'France Air'], model: 'EF' },
    ],
    locations: ['Plant room', 'Roof terrace', 'Office area', 'Meeting room', 'Ceiling void'],
    symptoms: [
      'No cooling',
      'Abnormal noise',
      'Water leak',
      'Temperature too high',
      'Fan not starting',
      'Filter alarm',
    ],
  },
  ELECTRICAL: {
    weight: 22,
    subcategories: [
      {
        name: 'Main LV switchboard',
        brands: ['Schneider Electric', 'ABB', 'Legrand'],
        model: 'MSB',
      },
      {
        name: 'Distribution board',
        brands: ['Schneider Electric', 'Hager', 'Legrand'],
        model: 'DB',
      },
      { name: 'UPS', brands: ['Eaton', 'Socomec', 'Vertiv'], model: 'UPS' },
      { name: 'Generator set', brands: ['Caterpillar', 'Cummins', 'Kohler'], model: 'GEN' },
      { name: 'Transformer', brands: ['Schneider Electric', 'Siemens', 'ABB'], model: 'TR' },
      {
        name: 'Lighting control panel',
        brands: ['Legrand', 'Philips', 'Hager'],
        model: 'LCP',
        where: 'office',
      },
    ],
    locations: ['Main electrical room', 'Floor electrical cupboard', 'Generator room', 'UPS room'],
    symptoms: ['Breaker tripped', 'Power loss', 'Battery alarm', 'Overheating', 'Lighting failure'],
  },
  FIRE_SAFETY: {
    weight: 15,
    subcategories: [
      {
        name: 'Fire alarm control panel',
        brands: ['Siemens', 'Honeywell', 'Bosch'],
        model: 'FACP',
      },
      { name: 'Smoke detector loop', brands: ['Siemens', 'Honeywell', 'Hochiki'], model: 'SDL' },
      {
        name: 'Sprinkler valve set',
        brands: ['Viking', 'Tyco', 'Minimax'],
        model: 'SVS',
        where: 'office',
      },
      {
        name: 'Gas suppression system',
        brands: ['Siemens', 'Minimax', 'Kidde'],
        model: 'GSS',
        where: 'dc',
      },
      { name: 'Fire damper', brands: ['Trox', 'France Air', 'Aldes'], model: 'FD' },
    ],
    locations: [
      'Security control room',
      'Stairwell',
      'Office area',
      'Car park',
      'Technical corridor',
    ],
    symptoms: ['Fault signal on panel', 'Detector in fault', 'Low pressure', 'False alarm'],
  },
  PLUMBING: {
    weight: 10,
    subcategories: [
      { name: 'Water heater', brands: ['Atlantic', 'Ariston', 'Viessmann'], model: 'WH' },
      { name: 'Booster pump', brands: ['Grundfos', 'Wilo', 'KSB'], model: 'BP' },
      { name: 'Backflow preventer', brands: ['Watts', 'Socla', 'Honeywell'], model: 'BFP' },
      { name: 'Sump pump', brands: ['Grundfos', 'Wilo', 'Flygt'], model: 'SP' },
      { name: 'Water softener', brands: ['Culligan', 'BWT', 'Permo'], model: 'WS' },
    ],
    locations: ['Sanitary block', 'Plant room', 'Basement', 'Kitchen area'],
    symptoms: ['Water leak', 'Low pressure', 'No hot water', 'Blocked drain'],
  },
  NETWORK_CABLING: {
    weight: 12,
    subcategories: [
      { name: 'Network rack', brands: ['APC', 'Legrand', 'Rittal'], model: 'RK' },
      { name: 'Patch panel', brands: ['Panduit', 'Nexans', 'CommScope'], model: 'PP' },
      {
        name: 'Fiber distribution frame',
        brands: ['CommScope', 'Corning', 'Nexans'],
        model: 'FDF',
      },
      {
        name: 'Wi-Fi access point',
        brands: ['Cisco', 'Aruba', 'Juniper Mist'],
        model: 'AP',
        where: 'office',
      },
    ],
    locations: ['Floor IT room', 'Main distribution room', 'Office area'],
    symptoms: ['Port not working', 'Damaged cable', 'Rack overheating', 'Access point offline'],
  },
  SECURITY: {
    weight: 11,
    subcategories: [
      { name: 'Access control reader', brands: ['HID', 'Nedap', 'STid'], model: 'ACR' },
      { name: 'CCTV camera', brands: ['Axis', 'Bosch', 'Hanwha'], model: 'CAM' },
      { name: 'Intrusion alarm panel', brands: ['Honeywell', 'Bosch', 'Risco'], model: 'IAP' },
      {
        name: 'Vault door controller',
        brands: ['Fichet', 'Gunnebo', 'Kaba'],
        model: 'VDC',
        where: 'office',
      },
      { name: 'Security turnstile', brands: ['Gunnebo', 'Automatic Systems', 'Kaba'], model: 'TS' },
    ],
    locations: ['Main entrance', 'Vault area', 'Car park entrance', 'Lift lobby', 'Cash room'],
    symptoms: [
      'Badge reader offline',
      'Camera image lost',
      'Door not locking',
      'Intrusion alarm fault',
    ],
  },
};

export const SUPPLIERS = [
  'Atlas Facility Services',
  'Nordis Maintenance',
  'Helio Technical',
  'Brightline Systems',
  'Veritec Services',
];

export const EXTERNAL_TECHNICIANS = [
  'Nina Petit (Atlas)',
  'Omar Haddad (Nordis)',
  'Paul Girard (Helio)',
];

export const ASSET_COMMENTS = [
  'Spare parts kept in the plant room.',
  'Access requires an escort from site security.',
  'Replacement planned in next year budget.',
  'Recurring alarms reported by occupants.',
  'Warranty until end of next year.',
];

export const WORK_REPORTS = {
  CORRECTIVE: [
    'Faulty component replaced; unit tested and back in service.',
    'Settings adjusted and connections tightened; tests OK.',
    'Cleaned and reset; monitored for 30 minutes with no recurrence.',
  ],
  PREVENTIVE: [
    'Maintenance checklist completed; no anomaly found.',
    'Filters and consumables replaced; checks completed.',
  ],
  IMPROVEMENT: [
    'Upgrade completed and documented.',
    'New settings applied and validated with the occupant.',
  ],
  REGULATORY: [
    'Inspection completed; compliance report filed.',
    'Periodic check done; certificate updated.',
  ],
};

export const IMPROVEMENT_TITLES = ['Upgrade', 'Energy optimisation', 'Replacement study'];

/**
 * Maintenance plans of the mock dataset (D48): what is maintained (an asset subcategory),
 * how often (weeks) and how long (hours per visit). `count` plans are made from each line, each
 * on its own asset. Visits above 3 h 30 show the "will be split" warning; fire safety and part
 * of security and plumbing are done by contractors, outside the internal load.
 */
export const PLAN_TEMPLATES = [
  // HVAC
  { sub: 'Air handling unit', title: 'Filter change and belt check', every: 4, hours: 3, count: 6 },
  { sub: 'Fan coil unit', title: 'Fan coil cleaning round', every: 13, hours: 8, count: 5 },
  { sub: 'Chiller', title: 'Quarterly chiller service', every: 13, hours: 4, count: 3 },
  { sub: 'Chiller', title: 'Annual chiller overhaul', every: 52, hours: 8, count: 1 },
  {
    sub: 'Precision air conditioner',
    title: 'Data hall cooling check',
    every: 1,
    hours: 3,
    count: 2,
  },
  {
    sub: 'Heat pump',
    title: 'Heat pump check before summer',
    every: 52,
    hours: 3,
    count: 2,
    season: [14, 22],
  },
  {
    sub: 'Extract fan',
    title: 'Extract fan check',
    every: 13,
    hours: 1.5,
    count: 2,
    floating: true,
  },
  // Electrical
  { sub: 'UPS', title: 'UPS battery test', every: 13, hours: 3, count: 3 },
  { sub: 'Generator set', title: 'Generator test run', every: 4, hours: 2.5, count: 3 },
  { sub: 'Generator set', title: 'Generator full load test', every: 52, hours: 5, count: 2 },
  {
    sub: 'Main LV switchboard',
    title: 'Thermographic inspection',
    every: 52,
    hours: 6,
    count: 3,
    regulatory: true,
  },
  {
    sub: 'Main LV switchboard',
    title: 'Weekly switchboard walk-round',
    every: 1,
    hours: 3.5,
    count: 4,
  },
  {
    sub: 'Distribution board',
    title: 'Distribution board tightening',
    every: 26,
    hours: 3.5,
    count: 3,
  },
  {
    sub: 'Lighting control panel',
    title: 'Emergency lighting test',
    every: 26,
    hours: 3,
    count: 3,
    regulatory: true,
  },
  {
    sub: 'Transformer',
    title: 'Transformer inspection',
    every: 52,
    hours: 4,
    count: 2,
    regulatory: true,
  },
  // Fire safety
  {
    sub: 'Fire alarm control panel',
    title: 'Fire alarm system check',
    every: 26,
    hours: 3,
    count: 3,
    regulatory: true,
    contractor: 'Veritec Services',
  },
  {
    sub: 'Sprinkler valve set',
    title: 'Sprinkler valve check',
    every: 1,
    hours: 1,
    count: 2,
    regulatory: true,
  },
  {
    sub: 'Gas suppression system',
    title: 'Gas suppression inspection',
    every: 26,
    hours: 2,
    count: 2,
    regulatory: true,
    contractor: 'Veritec Services',
  },
  // Plumbing
  {
    sub: 'Water heater',
    title: 'Legionella flushing and temperature check',
    every: 1,
    hours: 1.5,
    count: 3,
    regulatory: true,
  },
  { sub: 'Booster pump', title: 'Booster pump service', every: 26, hours: 2.5, count: 1 },
  {
    sub: 'Backflow preventer',
    title: 'Backflow preventer test',
    every: 52,
    hours: 1.5,
    count: 2,
    regulatory: true,
    contractor: 'Nordis Maintenance',
  },
  // Network cabling
  { sub: 'Network rack', title: 'Network room inspection', every: 13, hours: 2, count: 2 },
  // Security
  {
    sub: 'CCTV camera',
    title: 'CCTV maintenance visit',
    every: 26,
    hours: 2,
    count: 1,
    contractor: 'Brightline Systems',
  },
  { sub: 'Access control reader', title: 'Access control check', every: 13, hours: 1.5, count: 2 },
];

/** Office floors: open spaces east and west, three meeting rooms and a kitchen. */
const officeFloorRooms = (floor) => {
  const n = floor.slice(1);
  return [
    `Open space ${n} West`,
    `Open space ${n} East`,
    `Meeting room ${n}.01`,
    `Meeting room ${n}.02`,
    `Meeting room ${n}.03`,
    `Kitchen ${n}`,
  ];
};

/** Rooms of the branches, per floor. */
const BRANCH_ROOMS = {
  B1: ['Archive room', 'Staff changing room'],
  L0: ['Banking hall', 'Reception', 'Meeting room 0.01', 'Meeting room 0.02'],
  L1: ['Offices 1', 'Meeting room 1.01', 'Staff room', 'Kitchen'],
  L2: ['Offices 2', 'Meeting room 2.01'],
};

/** Rooms of the data center buildings, per building and floor. */
const DATA_CENTER_ROOMS = {
  'Hall DC1': { L0: ['Data hall 1', 'Loading bay'], L1: ['Operations office 1'] },
  'Hall DC2': { L0: ['Data hall 2'], L1: ['Operations office 2', 'Meeting room DC2'] },
  'Utility building': { B1: ['Workshop'], L0: ['Control room', 'Break room', 'Reception'] },
};

/**
 * The rooms of the mock dataset (D81, places of type Room since D82): `{ site, building, floor, name }`. Office towers
 * have rooms on every office floor; technical floors (basements) have none, so staff
 * describe those places in words.
 */
export function roomCatalog() {
  const rooms = [];
  for (const site of SITES) {
    for (const building of site.buildings) {
      for (const floor of building.floors) {
        let names = [];
        if (site.isDataCenter) names = DATA_CENTER_ROOMS[building.name]?.[floor] ?? [];
        else if (building.name.startsWith('Tower')) {
          if (floor === 'L0') names = ['Lobby', 'Reception'];
          else if (floor.startsWith('L')) names = officeFloorRooms(floor);
          if (building.name === 'Tower A' && floor === 'L12') names.push('Office 12.07');
        } else names = BRANCH_ROOMS[floor] ?? [];
        for (const name of names) {
          rooms.push({ site: site.name, building: building.name, floor, name });
        }
      }
    }
  }
  return rooms;
}
