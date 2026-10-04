import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT, loadConfig } from '../../src/config/index.js';

const valid = { JWT_SECRET: 'a-secret-of-sufficient-length' };

describe('loadConfig', () => {
  it('applies defaults and resolves the database path from the repository root', () => {
    const cfg = loadConfig(valid);
    expect(cfg).toMatchObject({
      nodeEnv: 'development',
      port: 3000,
      host: '127.0.0.1',
      jwtExpiresIn: '8h',
      timeZone: 'Europe/Paris',
      seedPassword: undefined,
    });
    expect(cfg.databasePath).toBe(path.join(REPO_ROOT, 'data', 'cmms.sqlite'));
  });

  it('keeps :memory: as is and coerces PORT', () => {
    const cfg = loadConfig({ ...valid, DATABASE_PATH: ':memory:', PORT: '8080' });
    expect(cfg.databasePath).toBe(':memory:');
    expect(cfg.port).toBe(8080);
  });

  it('fails fast and lists every invalid variable', () => {
    expect(() => loadConfig({ APP_TIMEZONE: 'Mars/Olympus', PORT: 'abc' })).toThrow(
      /JWT_SECRET[\s\S]*PORT|PORT[\s\S]*JWT_SECRET/,
    );
    expect(() => loadConfig({ ...valid, APP_TIMEZONE: 'Mars/Olympus' })).toThrow(/APP_TIMEZONE/);
  });

  it('rejects a short seed password (BR-U2)', () => {
    expect(() => loadConfig({ ...valid, SEED_PASSWORD: 'short' })).toThrow(/SEED_PASSWORD/);
  });

  it('requires a long secret in production', () => {
    expect(() => loadConfig({ JWT_SECRET: 'x'.repeat(20), NODE_ENV: 'production' })).toThrow(
      /at least 32 characters in production/,
    );
    expect(loadConfig({ JWT_SECRET: 'x'.repeat(32), NODE_ENV: 'production' }).nodeEnv).toBe(
      'production',
    );
  });

  it('rejects the example JWT secret in production only', () => {
    const example = { JWT_SECRET: 'change-me-long-random-string' };
    expect(() => loadConfig({ ...example, NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
    expect(loadConfig({ ...example, NODE_ENV: 'development' }).jwtSecret).toBe(example.JWT_SECRET);
  });
});
