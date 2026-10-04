import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import { REPO_ROOT } from './config/index.js';
import { authenticate } from './middleware/auth.js';
import { apiNotFound, errorHandler } from './middleware/error-handler.js';
import { assetsRouter } from './routes/assets.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { referenceRouter } from './routes/reference.js';
import { workOrdersRouter } from './routes/work-orders.js';
import { createAssetService } from './services/assets.js';
import { createAuthService } from './services/auth.js';
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
  app.use(express.json({ limit: '100kb' }));

  // API: public routes first, then everything else requires a valid token.
  app.use('/api/health', healthRouter(db));
  app.use('/api/auth', authRouter({ auth, authenticate: requireAuth, loginRateLimit }));
  app.use('/api', requireAuth);
  app.use('/api/assets', assetsRouter({ assets, now }));
  app.use('/api/work-orders', workOrdersRouter({ workOrders, timeZone: config.timeZone, now }));
  app.use('/api', referenceRouter({ referenceData, users }));
  app.use('/api', apiNotFound);

  // Frontend: static files, then the SPA fallback: any GET without a file extension
  // (a client route such as /assets/12) receives index.html.
  // `redirect: false`: the static folder frontend/assets/ shares its prefix with the client
  // route /assets; a directory redirect would turn /assets into /assets/.
  const indexFile = path.join(frontendDir, 'index.html');
  app.use(express.static(frontendDir, { index: false, redirect: false }));
  app.get('/{*path}', (req, res, next) => {
    if (path.extname(req.path) || !fs.existsSync(indexFile)) return next();
    res.sendFile(indexFile);
  });

  app.use(apiNotFound);
  app.use(errorHandler);
  return app;
}
