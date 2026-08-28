import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config/env.js';

const testConfig: AppConfig = {
  NODE_ENV: 'test',
  PORT: 3000,
  HOST: '127.0.0.1',
  LOG_LEVEL: 'silent',
  LINKEDIN_EMAIL: undefined,
  LINKEDIN_PASSWORD: undefined,
  LINKEDIN_STORAGE_STATE: 'storageState.json',
  BROWSER_HEADLESS: true,
  PAGE_TIMEOUT_MS: 30_000,
  SCRAPE_TIMEOUT_MS: 45_000,
  MAX_CONCURRENT_SCRAPES: 1,
  CACHE_TTL_SECONDS: 900,
  RATE_LIMIT_MAX: 10,
  RATE_LIMIT_WINDOW_MS: 60_000
};

const app = buildApp(testConfig);

afterAll(async () => {
  await app.close();
});

describe('system routes', () => {
  it('returns service information from the root route', async () => {
    const response = await app.inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      name: 'ProfileLens API',
      version: '0.1.0',
      status: 'running',
      docs: '/docs',
      health: '/health'
    });
  });

  it('returns a healthy status', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', version: '0.1.0' });
  });

  it('exposes the OpenAPI document', async () => {
    const response = await app.inject({ method: 'GET', url: '/openapi.json' });

    expect(response.statusCode).toBe(200);
    expect(response.json().paths['/v1/profile']).toBeDefined();
  });

  it('rejects a profile request without a URL', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/profile' });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_PROFILE_URL');
    expect(response.json().error.request_id).toMatch(/^req_/);
  });

  it('rejects non-LinkedIn profile URLs before browser access', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/profile?url=https%3A%2F%2Fexample.com%2F' });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_PROFILE_URL');
  });

  it('accepts profile URLs in a POST JSON body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/profile',
      payload: { url: 'https://example.com/' }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_PROFILE_URL');
  });
});
