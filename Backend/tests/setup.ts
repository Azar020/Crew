/**
 * Test environment setup: runs before every test file's imports.
 *
 * Provides a REQUIRED and well-formed environment for src/config/env.ts with
 * FAKE Google credentials (real Google calls are mocked in tests; the fake
 * credentials only let the "configured" code paths run without network).
 * Tests use the dedicated teamdesk_test database, never the dev database.
 */
import { TEST_DATABASE_URL } from './database-config.js';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = TEST_DATABASE_URL;

process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
process.env.GOOGLE_ALLOWED_HD = 'transacty.ai,n23digitals.com';
process.env.OAUTH_REDIRECT_URI = 'http://127.0.0.1:3000/auth/callback';
process.env.AUTH_TRUSTED_ORIGINS = 'http://127.0.0.1:3000';
process.env.SESSION_IDLE_MINUTES = '30';
process.env.SESSION_ABSOLUTE_HOURS = '12';
process.env.COMPANY_TIMEZONE = 'Asia/Kolkata';
