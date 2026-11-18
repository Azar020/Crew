import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('GET /health', () => {
  it('responds 200 with a minimal status body', async () => {
    const app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });

    await app.close();
  });

  it('does not leak sensitive information in the response', async () => {
    const app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/health' });
    const body = response.body;

    expect(body).not.toMatch(/postgres/i);
    expect(body).not.toMatch(/client|secret|token|cookie/i);

    await app.close();
  });
});
