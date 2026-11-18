import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { databaseAvailable } from './helpers/db.js';

/**
 * Rate limiting on authentication routes (mocked Google so no network is
 * used). Verifies /auth/login returns 429 after the configured burst.
 * Starts a transaction per login, so a reachable test database is required.
 */
vi.mock('../src/modules/auth/google.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../src/modules/auth/google.js')>();
  let n = 0;
  return {
    ...actual,
    buildGoogleAuthorizationRequest: vi.fn(async () => {
      n += 1;
      return {
        authorizationUrl: new URL(`https://accounts.google.com/o/oauth2/v2/auth?mock=${n}`),
        state: `state-${n}-${crypto.randomUUID()}`,
        nonce: `nonce-${n}`,
        codeVerifier: `verifier-${n}`,
      };
    }),
  };
});

const dbAvailable = await databaseAvailable();

describe.skipIf(!dbAvailable)('authentication route rate limiting', () => {
  it('GET /auth/login returns 429 after exceeding the per-IP limit', async () => {
    const app = await buildApp();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      const response = await app.inject({ method: 'GET', url: '/auth/login' });
      statuses.push(response.statusCode);
    }
    expect(statuses.filter((s) => s === 302).length).toBe(10);
    expect(statuses.filter((s) => s === 429).length).toBe(2);
    await app.close();
  });

  it('rate limiting is scoped to auth routes; /health is not limited', async () => {
    const app = await buildApp();
    for (let i = 0; i < 12; i += 1) {
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);
    }
    await app.close();
  });
});
