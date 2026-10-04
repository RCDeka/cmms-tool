import argon2 from 'argon2';
import { addDays } from '../../lib/dates.js';
import { createRandom } from './random.js';
import {
  ASSET_COMMENTS,
  CATEGORIES,
  EXTERNAL_TECHNICIANS,
  IMPROVEMENT_TITLES,
  SITES,
  SUPPLIERS,
  WORK_REPORTS,
} from './catalog.js';

const RANDOM_SEED = 20261004;
const ASSET_COUNT = 500;
const WORK_ORDER_COUNT = 200;
// Exact counts so the dataset is predictable (about 4 % broken down, docs/data-model.md).
const ASSET_STATUS_COUNTS = { BROKEN_DOWN: 20, UNDER_MAINTENANCE: 30, OUT_OF_SERVICE: 20 };

const USERS = [
  {
    username: 'admin',
    first_name: 'Claire',
    last_name: 'Martin',
    role: 'ADMIN',
    site: 'Paris La Défense Headquarters',
    specialty: null,
  },
  {
    username: 'supervisor1',
    first_name: 'Julien',
    last_name: 'Bernard',
    role: 'SUPERVISOR',
    site: 'Paris La Défense Headquarters',
    specialty: null,
  },
  {
    username: 'supervisor2',
    first_name: 'Sophie',
    last_name: 'Laurent',
    role: 'SUPERVISOR',
    site: 'Saclay Data Center',
    specialty: 'ELECTRICAL',
  },
  {
    username: 'technician1',
    first_name: 'Karim',
    last_name: 'Benali',
    role: 'TECHNICIAN',
    site: 'Paris La Défense Headquarters',
    specialty: 'HVAC',
  },
  {
    username: 'technician2',
    first_name: 'Lucas',
    last_name: 'Moreau',
    role: 'TECHNICIAN',
    site: 'Lyon Part-Dieu Branch',
    specialty: 'ELECTRICAL',
  },
];

/**
 * Fills an empty, migrated database with the mock dataset.
 * Dates are relative to `today`; with the same `today` the output is identical on every run.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object} options
 * @param {string} options.password  password given to every mock user (SEED_PASSWORD)
 * @param {string} options.today     'YYYY-MM-DD' in APP_TIMEZONE
 * @param {Date}   [options.now]     current instant, upper bound for generated timestamps
 * @param {boolean} [options.withConflicts] also create 3 open conflicts (dev demo)
 */
export async function seedDatabase(
  db,
  { password, today, now = new Date(), withConflicts = false },
) {
  if (!password || password.length < 10) {
    throw new Error('SEED_PASSWORD must be set and at least 10 characters long (BR-U2).');
  }
  const existing = db.prepare('SELECT count(*) FROM users').pluck().get();
  if (existing > 0) {
    throw new Error('The database already contains data. Use `npm run db:reset` to start over.');
  }

  const rng = createRandom(RANDOM_SEED);
  // Hash outside the transaction: argon2 is asynchronous, better-sqlite3 transactions are not.
  const hashes = await Promise.all(USERS.map(() => argon2.hash(password)));

  const timestamp = makeTimestamp(rng, now);
  const counts = db.transaction(() => {
    const users = insertUsers(db, hashes, timestamp, today);
    const assets = insertAssets(db, rng, timestamp, today);
    const workOrders = insertWorkOrders(db, rng, timestamp, today, users, assets);
    const conflicts = withConflicts ? insertConflicts(db, users, now) : 0;
    return { users: users.length, assets: assets.length, workOrders, conflicts };
  })();
  return counts;
}

/** Returns a function giving an ISO datetime on a date, at a random daytime hour, never after `now`. */
function makeTimestamp(rng, now) {
  const latest = new Date(now.getTime() - 60_000);
  return (date) => {
    const hh = String(rng.int(6, 17)).padStart(2, '0');
    const mm = String(rng.int(0, 59)).padStart(2, '0');
    const ss = String(rng.int(0, 59)).padStart(2, '0');
    const t = new Date(`${date}T${hh}:${mm}:${ss}.000Z`);
    return (t > latest ? latest : t).toISOString();
  };
}

function insertUsers(db, hashes, timestamp, today) {
  const stmt = db.prepare(`INSERT INTO users
    (username, password_hash, first_name, last_name, role, site, specialty, power_user, created_at, updated_at)
    VALUES (@username, @password_hash, @first_name, @last_name, @role, @site, @specialty, @power_user, @created_at, @created_at)`);
  return USERS.map((u, i) => {
    const row = {
      ...u,
      password_hash: hashes[i],
      // D21: auto-save mode for supervisors and admins.
      power_user: u.role === 'TECHNICIAN' ? 0 : 1,
      created_at: timestamp(addDays(today, -400)),
    };
    const id = Number(stmt.run(row).lastInsertRowid);
    return { id, ...u };
  });
}

function insertAssets(db, rng, timestamp, today) {
  const stmt = db.prepare(`INSERT INTO assets
    (code, name, site, building, floor, category, subcategory, criticality, status, brand, model,
     serial_number, commissioned_on, last_serviced_on, supplier, maintenance_contract,
     responsible_technician, exact_location, comment, created_at, updated_at)
    VALUES (@code, @name, @site, @building, @floor, @category, @subcategory, @criticality, @status,
     @brand, @model, @serial_number, @commissioned_on, @last_serviced_on, @supplier,
     @maintenance_contract, @responsible_technician, @exact_location, @comment, @created_at, @updated_at)`);

  const statuses = rng.shuffle([
    ...Object.entries(ASSET_STATUS_COUNTS).flatMap(([status, n]) => Array(n).fill(status)),
    ...Array(ASSET_COUNT - Object.values(ASSET_STATUS_COUNTS).reduce((a, b) => a + b, 0)).fill(
      'IN_SERVICE',
    ),
  ]);
  const technicianNames = [
    ...USERS.filter((u) => u.role === 'TECHNICIAN').map((u) => `${u.first_name} ${u.last_name}`),
    ...EXTERNAL_TECHNICIANS,
  ];

  const assets = [];
  for (let i = 0; i < ASSET_COUNT; i++) {
    const site = rng.weighted(SITES.map((s) => [s, s.weight]));
    const building = rng.pick(site.buildings);
    const floor = rng.pick(building.floors);
    const category = rng.weighted(Object.entries(CATEGORIES).map(([code, c]) => [code, c.weight]));
    const catalog = CATEGORIES[category];
    const sub = rng.pick(
      catalog.subcategories.filter((s) => !s.where || (s.where === 'dc') === site.isDataCenter),
    );
    const brand = rng.pick(sub.brands);
    const commissioned = addDays(today, -rng.int(180, 6500));
    let lastServiced = rng.chance(0.85) ? addDays(today, -rng.int(0, 400)) : null;
    if (lastServiced && lastServiced < commissioned) lastServiced = commissioned;
    const createdAt = timestamp(addDays(today, -rng.int(60, 400)));

    const row = {
      code: `AST-${String(i + 1).padStart(4, '0')}`,
      name: `${sub.name} – ${building.name} ${floor}`,
      site: site.name,
      building: building.name,
      floor,
      category,
      subcategory: sub.name,
      criticality: rng.weighted(
        site.isDataCenter
          ? [
              ['LOW', 5],
              ['MEDIUM', 20],
              ['HIGH', 40],
              ['CRITICAL', 35],
            ]
          : [
              ['LOW', 25],
              ['MEDIUM', 40],
              ['HIGH', 25],
              ['CRITICAL', 10],
            ],
      ),
      status: statuses[i],
      brand,
      model: `${sub.model}-${rng.int(100, 990)}`,
      serial_number: `${brand
        .replace(/[^A-Za-z]/g, '')
        .slice(0, 3)
        .toUpperCase()}${rng.int(10_000_000, 99_999_999)}`,
      commissioned_on: commissioned,
      last_serviced_on: lastServiced,
      supplier: rng.pick(SUPPLIERS),
      maintenance_contract: rng.chance(0.7) ? 1 : 0,
      responsible_technician: rng.pick(technicianNames),
      exact_location: rng.pick(catalog.locations),
      comment: rng.chance(0.15) ? rng.pick(ASSET_COMMENTS) : null,
      created_at: createdAt,
      updated_at: createdAt,
    };
    const id = Number(stmt.run(row).lastInsertRowid);
    assets.push({ id, ...row });
  }
  return assets;
}

function insertWorkOrders(db, rng, timestamp, today, users, assets) {
  const technicians = users.filter((u) => u.role === 'TECHNICIAN');
  const supervisors = users.filter((u) => u.role === 'SUPERVISOR');
  const creators = users.filter((u) => u.role !== 'TECHNICIAN');
  const earliest = (a, b) => (a < b ? a : b);

  const drafts = [];
  for (let i = 0; i < WORK_ORDER_COUNT; i++) {
    const createdOn = addDays(today, -rng.int(0, 29));
    const type = rng.weighted([
      ['CORRECTIVE', 50],
      ['PREVENTIVE', 30],
      ['IMPROVEMENT', 10],
      ['REGULATORY', 10],
    ]);
    const priority = rng.weighted([
      ['LOW', 20],
      ['NORMAL', 45],
      ['HIGH', 25],
      ['URGENT', 10],
    ]);
    const status = rng.weighted([
      ['OPEN', 25],
      ['IN_PROGRESS', 25],
      ['ON_HOLD', 10],
      ['CLOSED', 32],
      ['CANCELLED', 8],
    ]);

    // About 90 % linked to an asset; the work order then takes the asset's site and category (BR-W2).
    const asset = rng.chance(0.9) ? rng.pick(assets) : null;
    const site = asset ? asset.site : rng.pick(SITES).name;
    const category = asset
      ? asset.category
      : rng.chance(0.8)
        ? rng.pick(Object.keys(CATEGORIES))
        : null;
    const subcategory = asset
      ? asset.subcategory
      : rng.pick(CATEGORIES[category ?? 'HVAC'].subcategories).name;

    let assignee = rng.chance(0.8) ? rng.pick(technicians) : rng.pick(supervisors);
    if (status === 'OPEN' && rng.chance(0.15)) assignee = null;
    const creator = rng.pick(creators);

    // Dates follow BR-W5, BR-W6 and BR-W8 and never go past today.
    const dueOn = rng.chance(0.8)
      ? addDays(createdOn, priority === 'URGENT' ? rng.int(0, 2) : rng.int(1, 21))
      : null;
    const started =
      ['IN_PROGRESS', 'ON_HOLD', 'CLOSED'].includes(status) ||
      (status === 'CANCELLED' && rng.chance(0.4));
    const startedOn = started ? earliest(today, addDays(createdOn, rng.int(0, 3))) : null;
    const closedOn =
      status === 'CLOSED' ? earliest(today, addDays(startedOn, rng.int(0, 5))) : null;

    const estimated = rng.chance(0.85) ? rng.pick([0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16]) : null;
    let actual = null;
    if (status === 'CLOSED') {
      actual = Math.round((estimated ?? 2) * (0.6 + rng.next()) * 4) / 4;
    } else if (startedOn && rng.chance(0.5)) {
      actual = Math.round((estimated ?? 2) * rng.next() * 4) / 4;
    }

    const symptom = rng.pick(CATEGORIES[category ?? 'HVAC'].symptoms);
    const title = {
      CORRECTIVE: `${symptom} – ${subcategory}`,
      PREVENTIVE: `Scheduled maintenance – ${subcategory}`,
      IMPROVEMENT: `${rng.pick(IMPROVEMENT_TITLES)} – ${subcategory}`,
      REGULATORY: `Regulatory inspection – ${subcategory}`,
    }[type];
    const where = asset ? `${asset.building} ${asset.floor}, ${asset.exact_location}` : site;
    const description =
      type === 'CORRECTIVE' ? `${symptom} reported at ${where}.` : `${title} at ${where}.`;

    const createdAt = timestamp(createdOn);
    const lastChange = closedOn ?? startedOn ?? createdOn;
    const changedAt = timestamp(lastChange);
    const updatedAt = changedAt > createdAt ? changedAt : createdAt;

    drafts.push({
      type,
      status,
      priority,
      title,
      description,
      asset_id: asset?.id ?? null,
      site,
      category,
      assignee_id: assignee?.id ?? null,
      supervisor_id: rng.chance(0.9) ? rng.pick(supervisors).id : null,
      created_on: createdOn,
      due_on: dueOn,
      started_on: startedOn,
      closed_on: closedOn,
      estimated_hours: estimated,
      actual_hours: actual,
      work_report: status === 'CLOSED' ? rng.pick(WORK_REPORTS[type]) : null,
      created_by: creator.id,
      updated_by: started && assignee ? assignee.id : creator.id,
      created_at: createdAt,
      updated_at: updatedAt,
    });
  }

  // Numbers follow creation order, with a sequence per year (BR-W10).
  drafts.sort((a, b) => a.created_at.localeCompare(b.created_at));
  const sequence = new Map();
  const stmt = db.prepare(`INSERT INTO work_orders
    (number, type, status, priority, title, description, asset_id, site, category, assignee_id,
     supervisor_id, created_on, due_on, started_on, closed_on, estimated_hours, actual_hours,
     work_report, created_by, updated_by, created_at, updated_at)
    VALUES (@number, @type, @status, @priority, @title, @description, @asset_id, @site, @category,
     @assignee_id, @supervisor_id, @created_on, @due_on, @started_on, @closed_on, @estimated_hours,
     @actual_hours, @work_report, @created_by, @updated_by, @created_at, @updated_at)`);
  for (const wo of drafts) {
    const year = wo.created_on.slice(0, 4);
    const n = (sequence.get(year) ?? 0) + 1;
    sequence.set(year, n);
    stmt.run({ ...wo, number: `WO-${year}-${String(n).padStart(5, '0')}` });
  }
  return drafts.length;
}

/**
 * Dev demo: three records where a supervisor's change (version A) was saved first and a
 * technician's change based on the old version (version B) was rejected (BR-V3).
 */
function insertConflicts(db, users, now) {
  const supervisor = users.find((u) => u.username === 'supervisor1');
  const technician = users.find((u) => u.username === 'technician1');
  const serverAt = new Date(now.getTime() - 2 * 3600_000).toISOString();
  const clientAt = new Date(now.getTime() - 3600_000).toISOString();
  const flaggedAt = new Date(now.getTime() - 3500_000).toISOString();

  const assets = db
    .prepare("SELECT id FROM assets WHERE status = 'IN_SERVICE' ORDER BY id LIMIT 2")
    .pluck()
    .all();
  const workOrder = db
    .prepare("SELECT id FROM work_orders WHERE status = 'IN_PROGRESS' ORDER BY id LIMIT 1")
    .pluck()
    .get();

  const cases = [
    {
      table: 'assets',
      id: assets[0],
      server: { comment: 'Annual check done, no remark.' },
      client: { status: 'UNDER_MAINTENANCE', comment: 'Vibration noticed during the walk-round.' },
    },
    {
      table: 'assets',
      id: assets[1],
      server: { criticality: 'CRITICAL' },
      client: { criticality: 'HIGH', last_serviced_on: null },
    },
    {
      table: 'work_orders',
      id: workOrder,
      server: { priority: 'URGENT' },
      client: { actual_hours: 3.5, work_report: 'Contactor replaced, waiting for a final test.' },
    },
  ];

  const insert = db.prepare(`INSERT INTO conflicts
    (entity_type, entity_id, base_version, server_version, server_snapshot, client_changes,
     server_updated_by, server_updated_at, client_user_id, client_edited_at, created_at)
    VALUES (?, ?, 1, 2, ?, ?, ?, ?, ?, ?, ?)`);

  for (const c of cases) {
    // Table and column names come from the constants above, never from user input.
    const sets = Object.keys(c.server)
      .map((k) => `${k} = @${k}`)
      .join(', ');
    db.prepare(
      `UPDATE ${c.table} SET ${sets}, version = 2, updated_by = @by, updated_at = @at WHERE id = @id`,
    ).run({ ...c.server, by: supervisor.id, at: serverAt, id: c.id });
    const snapshot = db.prepare(`SELECT * FROM ${c.table} WHERE id = ?`).get(c.id);
    insert.run(
      c.table,
      c.id,
      JSON.stringify(snapshot),
      JSON.stringify(c.client),
      supervisor.id,
      serverAt,
      technician.id,
      clientAt,
      flaggedAt,
    );
    db.prepare(`UPDATE ${c.table} SET has_conflict = 1, updated_at = ? WHERE id = ?`).run(
      flaggedAt,
      c.id,
    );
  }
  return cases.length;
}
