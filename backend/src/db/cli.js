// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Database commands: `node src/db/cli.js <migrate|seed|reset|backup|feedback|release|create-admin> [options]`
// Used by the npm scripts db:migrate, db:seed, db:reset, db:backup, feedback:export, pm:release and
// user:create-admin.
import fs from 'node:fs';
import { loadConfig, loadEnvFile } from '../config/index.js';
import { dateInZone } from '../lib/dates.js';
import { feedbackMarkdown } from '../lib/feedback-report.js';
import { createFeedbackService } from '../services/feedback.js';
import { createPlanningService } from '../services/planning.js';
import { createWorkOrderService } from '../services/work-orders.js';
import { backupDatabase } from './backup.js';
import { openDb } from './connection.js';
import { createFirstAdmin } from './first-admin.js';
import { seedDatabase } from './seed/index.js';
import { migrateWithBackup } from './upgrade.js';

const USAGE = `Usage: node src/db/cli.js <command> [options]
  migrate | seed [--with-conflicts] | reset [--with-conflicts] [--force] | backup | feedback | release
  create-admin --username <name> --first-name <name> --last-name <name> [--site <site>]
    (asks for the password, or reads it from the first line of standard input)`;

/** Value of `--name value` or `--name=value` in the command-line flags. */
function optionValue(flags, name) {
  const index = flags.findIndex((f) => f === `--${name}` || f.startsWith(`--${name}=`));
  if (index === -1) return undefined;
  const flag = flags[index];
  return flag.includes('=') ? flag.slice(flag.indexOf('=') + 1) : flags[index + 1];
}

/** First line of piped standard input. */
async function readPipedLine() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text.split(/\r?\n/)[0];
}

/** Reads a line typed in the terminal without showing it. */
function readHidden(question) {
  const { stdin, stdout } = process;
  stdout.write(question);
  stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          finish();
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          finish();
          reject(new Error('Cancelled.'));
          return;
        }
        value = ch === '\u007f' || ch === '\b' ? value.slice(0, -1) : value + ch;
      }
    };
    stdin.on('data', onData);
  });
}

/** The new administrator's password: typed twice in a terminal, or piped (scripts). */
async function readPassword() {
  if (!process.stdin.isTTY) return readPipedLine();
  const password = await readHidden('Password (at least 10 characters): ');
  if ((await readHidden('Password again: ')) !== password) {
    throw new Error('The two passwords differ.');
  }
  return password;
}

/** Error text for the terminal, with the per-field messages of a validation error. */
function errorText(err) {
  const fields = err.details?.fields;
  if (!fields) return err.message;
  const lines = Object.entries(fields).map(([field, message]) => `  - ${field}: ${message}`);
  return `${err.message}:\n${lines.join('\n')}`;
}

async function main() {
  const [command, ...flags] = process.argv.slice(2);
  loadEnvFile();
  const config = loadConfig();

  // Every command migrates as the server does, with a backup first: after an update, the daily
  // release or a migrate by hand may run before the service restarts.
  const migrate = async (db) => {
    const { applied, backup } = await migrateWithBackup(db, {
      dir: config.backupDir,
      keepDays: config.backupKeepDays,
    });
    if (backup) console.error(`Backup before the migrations written: ${backup}`);
    return applied;
  };

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
      await migrate(db);
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
      await migrate(db);
      const planning = createPlanningService(db, { workOrders: createWorkOrderService(db) });
      const { released } = planning.release({ now: new Date(), timeZone: config.timeZone });
      console.log(`Released ${released} preventive work order${released === 1 ? '' : 's'}.`);
    } finally {
      db.close();
    }
    return;
  }

  // First administrator of a database without demo data (D70).
  if (command === 'create-admin') {
    const input = {
      username: optionValue(flags, 'username') ?? '',
      first_name: optionValue(flags, 'first-name') ?? '',
      last_name: optionValue(flags, 'last-name') ?? '',
      site: optionValue(flags, 'site') ?? null,
    };
    const db = openDb(config.databasePath);
    try {
      await migrate(db);
      const user = await createFirstAdmin(db, { ...input, password: await readPassword() });
      console.log(`Administrator ${user.username} created: log in and add the other accounts.`);
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
    const applied = await migrate(db);
    console.log(
      applied.length ? `Applied migrations: ${applied.join(', ')}` : 'Schema is up to date.',
    );

    if (command === 'seed' || command === 'reset') {
      const counts = await seedDatabase(db, {
        password: config.seedPassword,
        today: dateInZone(config.timeZone),
        timeZone: config.timeZone,
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
  console.error(errorText(err));
  process.exit(1);
});
