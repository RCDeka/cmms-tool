// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Database commands: `node src/db/cli.js <migrate|seed|reset|backup|feedback|release> [--with-conflicts] [--force]`
// Used by the npm scripts db:migrate, db:seed, db:reset, db:backup, feedback:export and pm:release.
import fs from 'node:fs';
import { loadConfig, loadEnvFile } from '../config/index.js';
import { dateInZone } from '../lib/dates.js';
import { feedbackMarkdown } from '../lib/feedback-report.js';
import { createFeedbackService } from '../services/feedback.js';
import { createPlanningService } from '../services/planning.js';
import { createWorkOrderService } from '../services/work-orders.js';
import { backupDatabase } from './backup.js';
import { openDb } from './connection.js';
import { runMigrations } from './migrate.js';
import { seedDatabase } from './seed/index.js';

const USAGE =
  'Usage: node src/db/cli.js <migrate|seed|reset|backup|feedback|release> [--with-conflicts] [--force]';

async function main() {
  const [command, ...flags] = process.argv.slice(2);
  loadEnvFile();
  const config = loadConfig();

  if (command === 'backup') {
    if (!fs.existsSync(config.databasePath))
      throw new Error(`No database at ${config.databasePath}`);
    const db = openDb(config.databasePath);
    try {
      const { file, removed } = await backupDatabase(db, {
        dir: config.backupDir,
        keepDays: config.backupKeepDays,
      });
      console.log(`Backup written: ${file}`);
      if (removed.length) console.log(`Deleted old backups: ${removed.join(', ')}`);
    } finally {
      db.close();
    }
    return;
  }

  // Open improvement ideas as Markdown on stdout (D40): `npm run feedback:export > ideas.md`.
  if (command === 'feedback') {
    const db = openDb(config.databasePath);
    try {
      runMigrations(db);
      process.stdout.write(feedbackMarkdown(createFeedbackService(db).openItems()));
    } finally {
      db.close();
    }
    return;
  }

  // Daily release of the preventive work orders due within the release horizon (BR-P6).
  if (command === 'release') {
    const db = openDb(config.databasePath);
    try {
      runMigrations(db);
      const planning = createPlanningService(db, { workOrders: createWorkOrderService(db) });
      const { released } = planning.release({ now: new Date(), timeZone: config.timeZone });
      console.log(`Released ${released} preventive work order${released === 1 ? '' : 's'}.`);
    } finally {
      db.close();
    }
    return;
  }

  if (command === 'reset') {
    if (config.nodeEnv === 'production' && !flags.includes('--force')) {
      throw new Error('Refusing to reset a production database without --force.');
    }
    for (const suffix of ['', '-wal', '-shm']) {
      fs.rmSync(config.databasePath + suffix, { force: true });
    }
    console.log(`Deleted ${config.databasePath}`);
  } else if (command !== 'migrate' && command !== 'seed') {
    throw new Error(USAGE);
  }

  const db = openDb(config.databasePath);
  try {
    const applied = runMigrations(db);
    console.log(
      applied.length ? `Applied migrations: ${applied.join(', ')}` : 'Schema is up to date.',
    );

    if (command === 'seed' || command === 'reset') {
      const counts = await seedDatabase(db, {
        password: config.seedPassword,
        today: dateInZone(config.timeZone),
        withConflicts: flags.includes('--with-conflicts'),
      });
      console.log(
        `Seeded ${counts.users} users, ${counts.assets} assets, ${counts.workOrders} work orders ` +
          `(${counts.requests} staff requests), ${counts.plans} maintenance plans, ` +
          `${counts.allocations} scheduled blocks (${counts.pastBlocks} in past weeks), ` +
          `${counts.pastVisits} past plan visits, ` +
          `${counts.conflicts} conflicts.`,
      );
    }
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
