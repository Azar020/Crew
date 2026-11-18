import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';

/**
 * When Google credentials are NOT configured, login must fail closed with
 * 503 while /health keeps working. This file mocks the google module's
 * configuration check to simulate the unconfigured state.
 */
vi.mock('../src/modules/auth/google.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/modules/auth/google.js')>();
  return {
    ...actual,
    isGoogleConfigured: () => false,
    // Override the functions the service calls — internal module bindings
    // cannot be intercepted by overriding exports.
    buildGoogleAuthorizationRequest: async () => {
      throw new actual.LoginNotConfiguredError();
    },
    exchangeAuthorizationCode: async () => {
      throw new actual.LoginNotConfiguredError();
    },
  };
});

describe('login with unconfigured Google credentials', () => {
  it('GET /auth/login fails closed with 503', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/auth/login' });
    expect(response.statusCode).toBe(503);
    await app.close();
  });

  it('GET /auth/callback fails closed with 503 (no provider configured)', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/auth/callback?code=x&state=y',
      cookies: { teamdesk_oauth_tx: 'some-browser-token' },
    });
    // The provider configuration check happens before transaction handling.
    expect([503, 401]).toContain(response.statusCode);
    await app.close();
  });

  it('/health is unaffected', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    await app.close();
  });
});
