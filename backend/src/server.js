import { createApp } from './app.js';
import { loadConfig, loadEnvFile } from './config/index.js';
import { openDb } from './db/connection.js';
import { runMigrations } from './db/migrate.js';

loadEnvFile();
let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const db = openDb(config.databasePath);
// Pending migrations are applied at startup, so a deployment only needs a restart.
const applied = runMigrations(db);
if (applied.length) console.log(`Applied migrations: ${applied.join(', ')}`);

const server = createApp({ db, config }).listen(config.port, config.host, () => {
  console.log(`Tacto listening on http://${config.host}:${config.port} (${config.nodeEnv})`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
