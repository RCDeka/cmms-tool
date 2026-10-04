import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import express from 'express';
import helmet from 'helmet';
import { REPO_ROOT } from './config/index.js';
import { authenticate } from './middleware/auth.js';
import { apiNotFound, errorHandler } from './middleware/error-handler.js';
import { assetsRouter } from './routes/assets.js';
import { auditRouter, historyHandler } from './routes/audit.js';
import { authRouter } from './routes/auth.js';
import { conflictsRouter } from './routes/conflicts.js';
import { dashboardRouter } from './routes/dashboard.js';
import { healthRouter } from './routes/health.js';
import { referenceRouter } from './routes/reference.js';
import { workOrdersRouter } from './routes/work-orders.js';
import { createAssetService } from './services/assets.js';
import { createAuditService } from './services/audit.js';
import { createAuthService } from './services/auth.js';
import { createConflictService } from './services/conflicts.js';
import { createDashboardService } from './services/dashboard.js';
import { createReferenceDataService } from './services/reference-data.js';
import { createUserService } from './services/users.js';
import { createWorkOrderService } from './services/work-orders.js';

export const FRONTEND_DIR = path.join(REPO_ROOT, 'frontend');

/** 10 login attempts per 15 minutes per IP address (docs/api-design.md). */
export const LOGIN_RATE_LIMIT = { windowMs: 15 * 60 * 1000, limit: 10 };

/**
 * Builds the Express application. It does not listen, so tests can use it with Supertest.
 * @param {object} deps
 * @param {import('better-sqlite3').Database} deps.db
 * @param {ReturnType<import('./config/index.js').loadConfig>} deps.config
 * @param {string} [deps.frontendDir] static files served in development (Nginx in production)
 * @param {() => Date} [deps.now] clock, replaceable in tests
 * @param {{ windowMs: number, limit: number }} [deps.loginRateLimit]
 */
export function createApp({
  db,
  config,
  frontendDir = FRONTEND_DIR,
  now = () => new Date(),
  loginRateLimit = LOGIN_RATE_LIMIT,
}) {
  const app = express();
  // In production Nginx runs on the same host: trust it for the client IP (rate limiting).
  app.set('trust proxy', 'loopback');

  const users = createUserService(db);
  const auth = createAuthService(config, users);
  const assets = createAssetService(db);
  const workOrders = createWorkOrderService(db);
  const referenceData = createReferenceDataService(db);
  const conflicts = createConflictService(db, { assets, workOrders });
  const dashboard = createDashboardService(db, { workOrders });
  const audit = createAuditService(db);
  const requireAuth = authenticate(config, users);

  app.use(
    helmet({
      // Strict policy (docs/architecture.md → Security): no inline scripts or styles.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          workerSrc: ["'self'"],
          manifestSrc: ["'self'"],
        },
      },
    }),
  );
  // gzip responses (Nginx also compresses in production; this covers direct access and dev).
  app.use(compression());
  app.use(express.json({ limit: '100kb' }));

  // API answers hold personal data and tokens: never stored by browsers or proxies.
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // API: public routes first, then everything else requires a valid token.
  app.use('/api/health', healthRouter(db));
  app.use('/api/auth', authRouter({ auth, authenticate: requireAuth, loginRateLimit }));
  app.use('/api', requireAuth);
  // History routes first: /:id/history must not be read as an id.
  app.get('/api/assets/:id/history', ...historyHandler(audit, 'assets', assets.getById));
  app.get(
    '/api/work-orders/:id/history',
    ...historyHandler(audit, 'work_orders', workOrders.getById),
  );
  app.use('/api/audit-log', auditRouter({ audit }));
  app.use('/api/assets', assetsRouter({ assets, now }));
  app.use('/api/work-orders', workOrdersRouter({ workOrders, timeZone: config.timeZone, now }));
  app.use('/api/conflicts', conflictsRouter({ conflicts }));
  app.use('/api/dashboard', dashboardRouter({ dashboard, timeZone: config.timeZone, now }));
  app.use('/api', referenceRouter({ referenceData, users }));
  app.use('/api', apiNotFound);

  // Frontend: only the shell is public: /assets/*, /sw.js and index.html. The rest of
  // frontend/ (package.json, tests, node_modules, tool configs) is never served (D31).
  // `redirect: false`: the static folder frontend/assets/ shares its prefix with the client
  // route /assets; a directory redirect would turn /assets into /assets/.
  const indexFile = path.join(frontendDir, 'index.html');
  app.use(
    '/assets',
    express.static(path.join(frontendDir, 'assets'), { index: false, redirect: false }),
  );
  // The shell itself; the service worker precaches it under this name.
  app.get('/index.html', (_req, res, next) => res.sendFile(indexFile, (err) => err && next()));
  app.get('/sw.js', (_req, res, next) => {
    // The browser checks for a new service worker on each visit: always revalidate.
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(frontendDir, 'sw.js'), (err) => err && next());
  });
  // SPA fallback: any GET without a file extension (a client route such as /assets/12)
  // receives index.html.
  app.get('/{*path}', (req, res, next) => {
    if (path.extname(req.path) || !fs.existsSync(indexFile)) return next();
    res.sendFile(indexFile);
  });

  app.use(apiNotFound);
  app.use(errorHandler);
  return app;
}
