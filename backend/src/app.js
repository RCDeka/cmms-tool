import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import { REPO_ROOT } from './config/index.js';
import { apiNotFound, errorHandler } from './middleware/error-handler.js';
import { healthRouter } from './routes/health.js';

export const FRONTEND_DIR = path.join(REPO_ROOT, 'frontend');

/**
 * Builds the Express application. It does not listen, so tests can use it with Supertest.
 * @param {object} deps
 * @param {import('better-sqlite3').Database} deps.db
 * @param {string} [deps.frontendDir] static files served in development (Nginx in production)
 */
export function createApp({ db, frontendDir = FRONTEND_DIR }) {
  const app = express();

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

  // API
  app.use('/api/health', healthRouter(db));
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
