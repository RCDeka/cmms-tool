// Fictional reference data for the mock dataset (docs/data-model.md → Seed data).

const floors = (from, to) => {
  const out = [];
  for (let i = from; i <= to; i++) out.push(i < 0 ? `B${-i}` : `L${i}`);
  return out;
};

export const SITES = [
  {
    name: 'Paris La Défense Headquarters',
    weight: 40,
    isDataCenter: false,
    buildings: [
      { name: 'Tower A', floors: floors(-2, 30) },
      { name: 'Tower B', floors: floors(-1, 18) },
    ],
  },
  {
    name: 'Saclay Data Center',
    weight: 25,
    isDataCenter: true,
    buildings: [
      { name: 'Hall DC1', floors: floors(0, 1) },
      { name: 'Hall DC2', floors: floors(0, 1) },
      { name: 'Utility building', floors: floors(-1, 0) },
    ],
  },
  {
    name: 'Lyon Part-Dieu Branch',
    weight: 12,
    isDataCenter: false,
    buildings: [{ name: 'Main building', floors: floors(-1, 2) }],
  },
  {
    name: 'Marseille Prado Branch',
    weight: 12,
    isDataCenter: false,
    buildings: [{ name: 'Main building', floors: floors(0, 1) }],
  },
  {
    name: 'Lille Grand Place Branch',
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
