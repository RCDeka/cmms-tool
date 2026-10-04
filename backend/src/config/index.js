import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** Repository root: relative paths in `.env` are resolved from here, where `.env` lives. */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const isValidTimeZone = (tz) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    // Loopback only by default: in production Nginx on the same host is the only client.
    HOST: z.string().min(1).default('127.0.0.1'),
    DATABASE_PATH: z.string().min(1).default('./data/cmms.sqlite'),
    JWT_SECRET: z.string().min(16, 'must be at least 16 characters'),
    JWT_EXPIRES_IN: z.string().min(1).default('8h'),
    APP_TIMEZONE: z
      .string()
      .default('Europe/Paris')
      .refine(isValidTimeZone, 'must be a valid IANA time zone'),
    SEED_PASSWORD: z.string().min(10, 'must be at least 10 characters (BR-U2)').optional(),
    BACKUP_DIR: z.string().min(1).default('./data/backups'),
    BACKUP_KEEP_DAYS: z.coerce.number().int().min(1).max(3650).default(14),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.JWT_SECRET.startsWith('change-me')) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: 'still has the example value; set a long random secret',
      });
    }
    if (env.NODE_ENV === 'production' && env.JWT_SECRET.length < 32) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: 'must be at least 32 characters in production (openssl rand -base64 48)',
      });
    }
  });

/**
 * Validates environment variables and returns the typed configuration.
 * Throws an Error listing every invalid variable, so the process fails fast at startup.
 * @param {Record<string, string | undefined>} env
 */
export function loadConfig(env = process.env) {
  const result = schema.safeParse(env);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join('\n')}`);
  }
  const cfg = result.data;
  return {
    nodeEnv: cfg.NODE_ENV,
    port: cfg.PORT,
    host: cfg.HOST,
    databasePath:
      cfg.DATABASE_PATH === ':memory:' ? ':memory:' : path.resolve(REPO_ROOT, cfg.DATABASE_PATH),
    jwtSecret: cfg.JWT_SECRET,
    jwtExpiresIn: cfg.JWT_EXPIRES_IN,
    timeZone: cfg.APP_TIMEZONE,
    seedPassword: cfg.SEED_PASSWORD,
    backupDir: path.resolve(REPO_ROOT, cfg.BACKUP_DIR),
    backupKeepDays: cfg.BACKUP_KEEP_DAYS,
  };
}

/** Loads `<repo>/.env` into process.env if present. Existing variables are not overridden. */
export function loadEnvFile() {
  const file = path.join(REPO_ROOT, '.env');
  if (fs.existsSync(file)) process.loadEnvFile(file);
}
