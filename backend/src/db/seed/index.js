import argon2 from 'argon2';
import { addDays } from '../../lib/dates.js';
import { addWeeks, formatWeek, weekOfDate, weekParts } from '../../lib/iso-week.js';
import { auditLabel, creationChanges, diffChanges } from '../../rules/audit.js';
import { snapshotToApi } from '../../rules/conflict-diff.js';
import { recordAudit } from '../../services/audit.js';
import { generateOccurrences } from '../../services/occurrences.js';
import { defaultTolerance, nextPlanCode } from '../../rules/planning.js';
import { createRandom } from './random.js';
import {
  ASSET_COMMENTS,
  CATEGORIES,
  EXTERNAL_TECHNICIANS,
  IMPROVEMENT_TITLES,
  PLAN_TEMPLATES,
  SITES,
  SUPPLIERS,
  WORK_REPORTS,
} from './catalog.js';

const RANDOM_SEED = 20261004;
// Staff requests use their own random stream, so adding them left the rest of the dataset
// unchanged (D46).
const REQUESTS_RANDOM_SEED = 20261008;
// Maintenance plans too (D48).
const PLANS_RANDOM_SEED = 20261009;
/**
 * Weeks after the current one where most long-period visits are placed, so the year planner
 * shows peaks to balance: a quarterly plan placed in the first comes back in each of the others.
 */
const HOT_OFFSETS = [3, 16, 29, 42];
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

/** Staff members: they only submit requests (D46). */
const STAFF_USERS = [
  {
    username: 'user1',
    first_name: 'Emma',
    last_name: 'Rousseau',
    role: 'STAFF',
    site: 'Paris La Défense Headquarters',
    specialty: null,
  },
];

/**
 * Requests of the staff member `user1`, one per stage of the workflow, with the conversation
 * that goes with them. Days are relative to today (negative: in the past); people are
 * usernames. Comments are written at fixed hours on days before today. A request with an
 * assignee was approved by supervisor1 (D47); `rejected` ones were refused for `reason`;
 * the others wait for the review.
 */
const STAFF_REQUESTS = [
  {
    created: -1,
    status: 'OPEN',
    priority: 'NORMAL',
    category: 'HVAC',
    title: 'Office too cold since this morning',
    description:
      'It is very cold in the open space: several colleagues are working in their coats.',
    location: 'Tower A, floor 12, open space by the windows (desks 12-40 to 12-48)',
    comments: [],
  },
  {
    created: -3,
    status: 'OPEN',
    priority: 'NORMAL',
    category: 'ELECTRICAL',
    title: 'Light flickering in meeting room 8.03',
    description: 'The ceiling light above the table flickers all the time; it gives headaches.',
    location: 'Tower B, floor 8, meeting room 8.03',
    assignee: 'technician1',
    due: 2,
    comments: [
      {
        by: 'supervisor1',
        day: -2,
        hour: 9,
        body: 'Karim will replace the light tube. The room can still be booked meanwhile.',
      },
    ],
  },
  {
    created: -5,
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    category: null,
    title: 'Strange noise in the ceiling',
    description: 'A loud rattling noise comes from the ceiling, mostly in the afternoon.',
    location: 'Tower A, floor 12, above desk 12-15',
    assignee: 'technician1',
    started: -4,
    comments: [
      { by: 'user1', day: -4, hour: 16, body: 'The noise is getting louder this afternoon.' },
      {
        by: 'technician1',
        day: -2,
        hour: 10,
        body: 'A ventilation duct is loose. I am fixing its supports; the noise may last until tomorrow.',
      },
    ],
  },
  {
    created: -9,
    status: 'ON_HOLD',
    priority: 'HIGH',
    category: 'SECURITY',
    title: 'Badge reader at the garage door does not work',
    description:
      'My badge is refused at the pedestrian door of the garage; colleagues have the same problem.',
    location: 'Tower A, level -1, garage pedestrian door',
    assignee: 'technician1',
    started: -8,
    comments: [
      {
        by: 'supervisor1',
        day: -7,
        hour: 14,
        body: 'The reader is faulty. A new one is ordered from the supplier and expected next week. Please use the main entrance meanwhile.',
      },
      { by: 'user1', day: -6, hour: 9, body: 'Thank you. Could you tell me when it is fixed?' },
    ],
  },
  {
    created: -6,
    status: 'CANCELLED',
    priority: 'LOW',
    category: null,
    title: 'Repaint my office in blue',
    description: 'The walls of my office are beige; a light blue would be nicer.',
    location: 'Tower A, floor 12, office 12.07',
    rejected: { day: -5, hour: 9 },
    reason:
      'Decoration is not maintenance work: please ask your manager to contact the workplace team.',
    comments: [],
  },
  {
    created: -14,
    status: 'CLOSED',
    priority: 'HIGH',
    category: 'PLUMBING',
    title: 'Water leak under the kitchen sink',
    description: 'There is water on the floor under the sink every morning.',
    location: 'Tower A, floor 12, kitchen',
    assignee: 'technician1',
    started: -13,
    closed: -13,
    hours: 1,
    report: 'Siphon seal replaced and connections tightened. No more leak after a one-hour test.',
    comments: [{ by: 'user1', day: -12, hour: 9, body: 'All good now, thank you!' }],
  },
  {
    created: -24,
    status: 'CLOSED',
    priority: 'NORMAL',
    category: 'NETWORK_CABLING',
    title: 'Network socket not working at my desk',
    description: 'My computer has no network when plugged into the wall socket.',
    location: 'Tower A, floor 12, desk 12-21',
    assignee: 'technician1',
    started: -23,
    closed: -22,
    hours: 0.5,
    report: 'Socket 12-21-B re-patched in the floor 12 network room; link tested at 1 Gbit/s.',
    comments: [],
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
  const staffHashes = await Promise.all(STAFF_USERS.map(() => argon2.hash(password)));

  const timestamp = makeTimestamp(rng, now);
  const requestTimestamp = makeTimestamp(createRandom(REQUESTS_RANDOM_SEED), now);
  const counts = db.transaction(() => {
    const users = insertUsers(db, USERS, hashes, timestamp, today);
    const staff = insertUsers(db, STAFF_USERS, staffHashes, requestTimestamp, today);
    const assets = insertAssets(db, rng, timestamp, today);
    const requests = requestDrafts([...users, ...staff], requestTimestamp, today);
    const workOrders = insertWorkOrders(db, rng, timestamp, today, users, assets, requests);
    insertRequestComments(db, [...users, ...staff], today, now);
    insertHistory(db);
    const plans = insertPlans(
      db,
      today,
      users,
      makeTimestamp(createRandom(PLANS_RANDOM_SEED), now),
    );
    const allocations = insertSchedule(db, today, now);
    const conflicts = withConflicts ? insertConflicts(db, users, now) : 0;
    return {
      users: users.length + staff.length,
      assets: assets.length,
      workOrders,
      requests: requests.length,
      plans,
      allocations,
      conflicts,
    };
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

function insertUsers(db, list, hashes, timestamp, today) {
  const stmt = db.prepare(`INSERT INTO users
    (username, password_hash, first_name, last_name, role, site, specialty, power_user, created_at, updated_at)
    VALUES (@username, @password_hash, @first_name, @last_name, @role, @site, @specialty, @power_user, @created_at, @created_at)`);
  return list.map((u, i) => {
    const row = {
      ...u,
      password_hash: hashes[i],
      // D21: auto-save mode for supervisors and admins.
      power_user: ['SUPERVISOR', 'ADMIN'].includes(u.role) ? 1 : 0,
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

/** Work order rows of STAFF_REQUESTS, in the shape insertWorkOrders inserts. */
function requestDrafts(users, timestamp, today) {
  const id = (username) => users.find((u) => u.username === username).id;
  const requester = id('user1');
  return STAFF_REQUESTS.map((r) => {
    const createdOn = addDays(today, r.created);
    const startedOn = r.started === undefined ? null : addDays(today, r.started);
    const closedOn = r.closed === undefined ? null : addDays(today, r.closed);
    const assignee = r.assignee ? id(r.assignee) : null;
    const createdAt = timestamp(createdOn);
    const rejectedAt = r.rejected
      ? `${addDays(today, r.rejected.day)}T${String(r.rejected.hour).padStart(2, '0')}:00:00.000Z`
      : null;
    // Assigned but not started: approved the day after it was sent.
    const reviewedOn = assignee && !startedOn ? addDays(createdOn, 1) : null;
    const changedAt = rejectedAt ?? timestamp(closedOn ?? startedOn ?? reviewedOn ?? createdOn);
    const updatedAt = changedAt > createdAt ? changedAt : createdAt;
    return {
      type: 'CORRECTIVE',
      status: r.status,
      priority: r.priority,
      title: r.title,
      description: r.description,
      asset_id: null,
      site: 'Paris La Défense Headquarters',
      location: r.location,
      category: r.category,
      assignee_id: assignee,
      supervisor_id: assignee ? id('supervisor1') : null,
      created_on: createdOn,
      due_on: r.due === undefined ? null : addDays(today, r.due),
      started_on: startedOn,
      closed_on: closedOn,
      estimated_hours: null,
      actual_hours: r.hours ?? null,
      work_report: r.report ?? null,
      created_by: requester,
      updated_by: startedOn ? assignee : assignee || r.rejected ? id('supervisor1') : requester,
      review_status: assignee ? 'APPROVED' : r.rejected ? 'REJECTED' : 'PENDING',
      reviewed_by: assignee || r.rejected ? id('supervisor1') : null,
      reviewed_at: rejectedAt ?? (assignee ? between(createdAt, updatedAt, 0.2) : null),
      review_note: r.reason ?? null,
      created_at: createdAt,
      updated_at: updatedAt,
    };
  });
}

/** The conversations of STAFF_REQUESTS (docs/data-model.md → work_order_comments). */
function insertRequestComments(db, users, today, now) {
  const byName = new Map(users.map((u) => [u.username, u]));
  const requester = byName.get('user1');
  const workOrderId = db
    .prepare('SELECT id FROM work_orders WHERE created_by = ? AND title = ?')
    .pluck();
  const stmt = db.prepare(`INSERT INTO work_order_comments
    (work_order_id, user_id, user_role, body, created_at)
    VALUES (@work_order_id, @user_id, @user_role, @body, @created_at)`);
  const latest = new Date(now.getTime() - 60_000).toISOString();
  for (const r of STAFF_REQUESTS) {
    for (const c of r.comments) {
      const author = byName.get(c.by);
      const at = `${addDays(today, c.day)}T${String(c.hour).padStart(2, '0')}:00:00.000Z`;
      stmt.run({
        work_order_id: workOrderId.get(requester.id, r.title),
        user_id: author.id,
        user_role: author.role,
        body: c.body,
        created_at: at < latest ? at : latest,
      });
    }
  }
}

function insertWorkOrders(db, rng, timestamp, today, users, assets, requests) {
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
      location: null,
      category,
      review_status: null,
      reviewed_by: null,
      reviewed_at: null,
      review_note: null,
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
  drafts.push(...requests);
  drafts.sort((a, b) => a.created_at.localeCompare(b.created_at));
  const sequence = new Map();
  const stmt = db.prepare(`INSERT INTO work_orders
    (number, type, status, priority, title, description, asset_id, site, location, category,
     assignee_id, supervisor_id, created_on, due_on, started_on, closed_on, estimated_hours,
     actual_hours, work_report, created_by, updated_by, review_status, reviewed_by, reviewed_at,
     review_note, created_at, updated_at)
    VALUES (@number, @type, @status, @priority, @title, @description, @asset_id, @site, @location,
     @category,
     @assignee_id, @supervisor_id, @created_on, @due_on, @started_on, @closed_on, @estimated_hours,
     @actual_hours, @work_report, @created_by, @updated_by, @review_status, @reviewed_by,
     @reviewed_at, @review_note, @created_at, @updated_at)`);
  for (const wo of drafts) {
    const year = wo.created_on.slice(0, 4);
    const n = (sequence.get(year) ?? 0) + 1;
    sequence.set(year, n);
    stmt.run({ ...wo, number: `WO-${year}-${String(n).padStart(5, '0')}` });
  }
  return drafts.length;
}

/**
 * Maintenance plans from PLAN_TEMPLATES, each on its own asset, with their creation in the
 * audit log and their occurrences up to the horizon. Most long-period plans start in the same
 * weeks (HOT_OFFSETS), so some weeks are over capacity. Work orders are not released here: the
 * daily job or the first opening of the planner does it (BR-P6).
 * @returns {number} plans created
 */
function insertPlans(db, today, users, timestamp) {
  const rng = createRandom(PLANS_RANDOM_SEED);
  const currentWeek = weekOfDate(today);
  const authors = users.filter((u) => u.role === 'SUPERVISOR');
  const assets = db
    .prepare(
      "SELECT id, code, site, building, floor, subcategory FROM assets WHERE status <> 'OUT_OF_SERVICE' ORDER BY id",
    )
    .all();
  const used = new Set();
  const insert = db.prepare(`INSERT INTO maintenance_plans
    (code, title, description, type, category, asset_id, site, building, location, estimated_hours,
     frequency_weeks, anchor_week, end_week, schedule_mode, tolerance_weeks, season_from_week,
     season_to_week, performed_by, supplier, created_by, updated_by, created_at, updated_at)
    VALUES (@code, @title, @description, @type, @category, @asset_id, @site, @building, @location,
     @estimated_hours, @frequency_weeks, @anchor_week, @end_week, @schedule_mode, @tolerance_weeks,
     @season_from_week, @season_to_week, @performed_by, @supplier, @created_by, @created_by,
     @created_at, @created_at)`);

  let count = 0;
  for (const t of PLAN_TEMPLATES) {
    for (let i = 0; i < t.count; i++) {
      const fitting = assets.filter((a) => a.subcategory === t.sub);
      const asset = rng.pick(
        fitting.filter((a) => !used.has(a.id)).length
          ? fitting.filter((a) => !used.has(a.id))
          : fitting,
      );
      used.add(asset.id);
      const category = db.prepare('SELECT category FROM assets WHERE id = ?').pluck().get(asset.id);
      // A seasonal plan: the first in its season next spring, the others where they fall
      // (outside the season: the planner warns).
      const anchor =
        t.season && i === 0
          ? nextSeasonWeek(currentWeek, t.season[0])
          : addWeeks(currentWeek, anchorOffset(rng, t.every));
      const plan = {
        code: nextPlanCode(count),
        title: `${t.title}, ${asset.building} ${asset.floor}`,
        description: `Preventive visit of ${asset.code} (${asset.subcategory}) following the maintenance checklist.`,
        type: t.regulatory ? 'REGULATORY' : 'PREVENTIVE',
        category,
        asset_id: asset.id,
        site: asset.site,
        building: asset.building,
        location: null,
        estimated_hours: t.hours,
        frequency_weeks: t.every,
        anchor_week: anchor,
        // One contract ends in a little over a year.
        end_week: t.contractor && i === 0 ? addWeeks(currentWeek, 60) : null,
        schedule_mode: t.floating ? 'FLOATING' : 'FIXED',
        tolerance_weeks: defaultTolerance(t.every),
        season_from_week: t.season?.[0] ?? null,
        season_to_week: t.season?.[1] ?? null,
        performed_by: t.contractor ? 'CONTRACTOR' : 'INTERNAL',
        supplier: t.contractor ?? null,
        created_by: rng.pick(authors).id,
        created_at: timestamp(addDays(today, -rng.int(20, 120))),
      };
      const id = Number(insert.run(plan).lastInsertRowid);
      const { created_by: author, created_at: at, code: _code, ...fields } = plan;
      recordAudit(db, {
        entityType: 'maintenance_plans',
        entityId: id,
        action: 'CREATE',
        changes: creationChanges({ code: plan.code, ...fields, is_active: true }),
        label: auditLabel('maintenance_plans', plan),
        userId: author,
        version: 1,
        at,
      });
      generateOccurrences(
        db,
        { ...plan, id, is_active: 1 },
        { currentWeek, stamp: plan.created_at },
      );
      count += 1;
    }
  }
  return count;
}

/**
 * A week of the week scheduler (D48, Phase 19), the current week: technician1 has a job split
 * over Monday and Tuesday, an appointment locked at 10:00 on Tuesday, and two sites on
 * Wednesday with travel time between them; technician2 has preparation time, work on Monday
 * and Tuesday, and is on leave on Thursday. The work orders are open ones already assigned to
 * them; they get the current week as their planned week. No random stream: the choice follows
 * the work order ids.
 * @returns {number} blocks created
 */
function insertSchedule(db, today, now) {
  const week = weekOfDate(today);
  const monday = addDays(today, 1 - (new Date(`${today}T00:00:00Z`).getUTCDay() || 7));
  const day = (n) => addDays(monday, n);
  const stamp = new Date(now.getTime() - 60_000).toISOString();
  const id = (username) =>
    db.prepare('SELECT id FROM users WHERE username = ?').pluck().get(username);
  const supervisor = id('supervisor1');
  const openOf = (person) =>
    db
      .prepare(
        `SELECT id, number, site, estimated_hours FROM work_orders
         WHERE assignee_id = ? AND status IN ('OPEN', 'IN_PROGRESS') AND estimated_hours IS NOT NULL
           AND review_status IS NOT 'PENDING' AND plan_id IS NULL ORDER BY id`,
      )
      .all(person);

  const tech1 = id('technician1');
  const tech2 = id('technician2');
  const mine1 = openOf(tech1);
  const mine2 = openOf(tech2);
  const long =
    mine1.find((w) => w.estimated_hours >= 5 && w.estimated_hours <= 7) ??
    mine1.find((w) => w.estimated_hours > 3.5) ??
    mine1[0];
  const rest1 = mine1.filter((w) => w !== long);
  const appointment = rest1[0];
  const first = rest1.find((w) => w !== appointment);
  const second = rest1.find((w) => w !== appointment && w.site !== first.site) ?? rest1[2];
  const hours = (w, max = 3.5) => Math.min(max, Math.ceil(w.estimated_hours * 2) / 2);
  const needed = Math.ceil(long.estimated_hours * 2) / 2;

  const blocks = [
    // A job split over two days (BR-S1).
    { kind: 'WORK', wo: long, person: tech1, day: day(0), hours: Math.min(3.5, needed) },
    ...(needed > 3.5
      ? [{ kind: 'WORK', wo: long, person: tech1, day: day(1), hours: needed - 3.5 }]
      : []),
    // An appointment (P6).
    {
      kind: 'WORK',
      wo: appointment,
      person: tech1,
      day: day(1),
      hours: hours(appointment, 2),
      locked_start: '10:00',
      note: 'Keys at reception',
    },
    // Two sites in a day, with travel time (BR-S10).
    { kind: 'WORK', wo: first, person: tech1, day: day(2), hours: hours(first, 3) },
    {
      kind: 'TRAVEL',
      person: tech1,
      day: day(2),
      hours: 1,
      note: `${first.site} → ${second.site}`,
    },
    { kind: 'WORK', wo: second, person: tech1, day: day(2), hours: hours(second, 3) },
    { kind: 'PREPARATION', person: tech2, day: day(0), hours: 0.5, note: 'Collect the parts' },
    { kind: 'WORK', wo: mine2[0], person: tech2, day: day(0), hours: hours(mine2[0]) },
    { kind: 'WORK', wo: mine2[1], person: tech2, day: day(1), hours: hours(mine2[1]) },
  ];

  const insert = db.prepare(`INSERT INTO allocations
    (kind, work_order_id, technician_id, day, hours, locked_start, locked_by, position, note,
     created_by, updated_by, created_at, updated_at)
    VALUES (@kind, @work_order_id, @technician_id, @day, @hours, @locked_start, @locked_by,
     @position, @note, @user, @user, @stamp, @stamp)`);
  const positions = new Map();
  const names = new Map(
    db
      .prepare('SELECT id, first_name, last_name FROM users')
      .all()
      .map((u) => [u.id, `${u.first_name} ${u.last_name}`]),
  );
  for (const b of blocks) {
    const key = `${b.person}:${b.day}`;
    positions.set(key, (positions.get(key) ?? 0) + 1);
    const row = {
      kind: b.kind,
      work_order_id: b.wo?.id ?? null,
      technician_id: b.person,
      day: b.day,
      hours: b.hours,
      locked_start: b.locked_start ?? null,
      locked_by: b.locked_start ? supervisor : null,
      position: positions.get(key),
      note: b.note ?? null,
    };
    const blockId = Number(insert.run({ ...row, user: supervisor, stamp }).lastInsertRowid);
    const { position: _p, locked_by: _l, ...logged } = row;
    recordAudit(db, {
      entityType: 'allocations',
      entityId: blockId,
      action: 'CREATE',
      changes: creationChanges(logged),
      label: `${b.wo?.number ?? { TRAVEL: 'Travel', PREPARATION: 'Preparation' }[b.kind]} · ${names.get(b.person)} · ${b.day}`,
      userId: supervisor,
      version: 1,
      at: stamp,
    });
  }
  const planned = [...new Set(blocks.map((b) => b.wo?.id).filter(Boolean))];
  const setWeek = db.prepare('UPDATE work_orders SET planned_week = ? WHERE id = ?');
  for (const woId of planned) setWeek.run(week, woId);

  // An absence (P5).
  db.prepare(
    `INSERT INTO capacity_overrides (technician_id, day, hours, reason, note, updated_by, updated_at)
     VALUES (?, ?, 0, 'LEAVE', 'Annual leave', ?, ?)`,
  ).run(tech2, day(3), supervisor, stamp);
  return blocks.length;
}

/** Weeks from now to a plan's first visit: often one of the busy weeks, else anywhere. */
function anchorOffset(rng, every) {
  if (every === 1) return 0;
  if (rng.chance(0.6)) {
    const hot = HOT_OFFSETS.filter((o) => o < every);
    return every >= 26 ? rng.pick(hot) : HOT_OFFSETS[0] % every;
  }
  return rng.int(0, every - 1);
}

/** The next week numbered `n` from the current week on. */
function nextSeasonWeek(currentWeek, n) {
  const { year, week } = weekParts(currentWeek);
  return formatWeek(week <= n ? year : year + 1, n);
}

/** Instant between two ISO datetimes (fraction 0 → a, 1 → b). */
function between(a, b, fraction) {
  const t = new Date(a).getTime();
  return new Date(t + (new Date(b).getTime() - t) * fraction).toISOString();
}

/**
 * Audit history matching the generated data (docs/data-model.md → audit_log): a creation
 * entry for every asset and work order, then the status changes of each work order, spread
 * between its creation and its last update.
 */
function insertHistory(db) {
  const admin = db
    .prepare("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY id LIMIT 1")
    .pluck()
    .get();
  for (const row of db.prepare('SELECT * FROM assets ORDER BY id').all()) {
    const asset = snapshotToApi('assets', row);
    const {
      id,
      version: _v,
      has_conflict: _c,
      updated_by: _u,
      created_at: _ca,
      updated_at: _ua,
      ...fields
    } = asset;
    recordAudit(db, {
      entityType: 'assets',
      entityId: id,
      action: 'CREATE',
      changes: creationChanges(fields),
      label: auditLabel('assets', asset),
      userId: admin,
      version: 1,
      at: row.created_at,
    });
  }

  const staff = new Set(db.prepare("SELECT id FROM users WHERE role = 'STAFF'").pluck().all());
  for (const wo of db.prepare('SELECT * FROM work_orders ORDER BY id').all()) {
    const label = auditLabel('work_orders', wo);
    // Staff requests are created unassigned and wait for a review: a supervisor approves and
    // assigns them, or rejects them (D46, D47).
    const isRequest = staff.has(wo.created_by);
    const worker = wo.assignee_id ?? wo.created_by;
    const entry = (action, changes, userId, at, note) =>
      recordAudit(db, {
        entityType: 'work_orders',
        entityId: wo.id,
        action,
        changes,
        note,
        label,
        userId,
        version: 1,
        at,
      });

    entry(
      'CREATE',
      creationChanges({
        number: wo.number,
        type: wo.type,
        status: 'OPEN',
        priority: wo.priority,
        title: wo.title,
        description: wo.description,
        asset_id: wo.asset_id,
        site: wo.site,
        location: wo.location,
        category: wo.category,
        assignee_id: isRequest ? null : wo.assignee_id,
        supervisor_id: isRequest ? null : wo.supervisor_id,
        created_on: wo.created_on,
        due_on: isRequest ? null : wo.due_on,
        estimated_hours: wo.estimated_hours,
        review_status: isRequest ? 'PENDING' : null,
      }),
      wo.created_by,
      wo.created_at,
    );
    if (wo.review_status === 'APPROVED') {
      entry(
        'UPDATE',
        {
          ...creationChanges({
            assignee_id: wo.assignee_id,
            supervisor_id: wo.supervisor_id,
            due_on: wo.due_on,
          }),
          review_status: { from: 'PENDING', to: 'APPROVED' },
        },
        wo.reviewed_by,
        wo.reviewed_at,
        { review: 'APPROVED' },
      );
    } else if (wo.review_status === 'REJECTED') {
      entry(
        'UPDATE',
        {
          status: { from: 'OPEN', to: 'CANCELLED' },
          review_status: { from: 'PENDING', to: 'REJECTED' },
          review_note: { from: null, to: wo.review_note },
        },
        wo.reviewed_by,
        wo.reviewed_at,
        { review: 'REJECTED' },
      );
      continue;
    }
    if (wo.started_on) {
      entry(
        'UPDATE',
        {
          status: { from: 'OPEN', to: 'IN_PROGRESS' },
          started_on: { from: null, to: wo.started_on },
        },
        worker,
        between(wo.created_at, wo.updated_at, 0.4),
      );
    }
    const last = wo.started_on ? 'IN_PROGRESS' : 'OPEN';
    if (wo.status === 'ON_HOLD') {
      entry('UPDATE', { status: { from: last, to: 'ON_HOLD' } }, worker, wo.updated_at);
    } else if (wo.status === 'CLOSED') {
      entry(
        'UPDATE',
        diffChanges(
          { status: last },
          {
            status: 'CLOSED',
            closed_on: wo.closed_on,
            work_report: wo.work_report,
            actual_hours: wo.actual_hours,
          },
        ),
        worker,
        wo.updated_at,
      );
    } else if (wo.status === 'CANCELLED') {
      entry('UPDATE', { status: { from: last, to: 'CANCELLED' } }, wo.created_by, wo.updated_at);
    }
  }
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
    // Read before the change, so the history shows the real old values.
    const before = snapshotToApi(
      c.table,
      db.prepare(`SELECT * FROM ${c.table} WHERE id = ?`).get(c.id),
    );
    db.prepare(
      `UPDATE ${c.table} SET ${sets}, version = 2, updated_by = @by, updated_at = @at WHERE id = @id`,
    ).run({ ...c.server, by: supervisor.id, at: serverAt, id: c.id });
    const snapshot = db.prepare(`SELECT * FROM ${c.table} WHERE id = ?`).get(c.id);
    const label = auditLabel(c.table, snapshot);
    recordAudit(db, {
      entityType: c.table,
      entityId: c.id,
      action: 'UPDATE',
      changes: diffChanges(before, c.server),
      label,
      userId: supervisor.id,
      version: 2,
      at: serverAt,
    });
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
    const conflictId = db.prepare('SELECT max(id) FROM conflicts').pluck().get();
    recordAudit(db, {
      entityType: c.table,
      entityId: c.id,
      action: 'CONFLICT',
      changes: diffChanges(snapshotToApi(c.table, snapshot), c.client),
      note: { conflict_id: conflictId, base_version: 1 },
      label,
      userId: technician.id,
      version: 2,
      at: flaggedAt,
    });
  }
  return cases.length;
}
