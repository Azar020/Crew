/**
 * Reports which external credentials and settings are configured, without
 * printing any secret values. Run: npm run check:env
 */
import 'dotenv/config';
import { env } from '../src/config/env.js';

const googleAuth = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
const hdAllowlist = Boolean(env.GOOGLE_ALLOWED_HD);
const sheets = Boolean(
  env.GOOGLE_SHEETS_CREDENTIALS_PATH && env.GOOGLE_SHEETS_SPREADSHEET_ID,
);
const email = Boolean(env.SMTP_HOST && env.SMTP_PORT);

console.log('Environment configuration is valid.');
console.log(`NODE_ENV=${env.NODE_ENV}  HOST=${env.HOST}  PORT=${env.PORT}`);
console.log('DATABASE_URL: configured (value not shown)');
console.log('Google authentication:      ', googleAuth ? 'configured' : 'not configured (login returns 503)');
console.log('Allowed hd claims:          ', hdAllowlist ? 'configured' : 'not configured (all logins denied)');
console.log('OAuth redirect URI:         ', env.OAUTH_REDIRECT_URI);
console.log('Trusted origins:            ', env.AUTH_TRUSTED_ORIGINS);
console.log(`Session idle expiry:         ${env.SESSION_IDLE_MINUTES} min`);
console.log(`Session absolute expiry:     ${env.SESSION_ABSOLUTE_HOURS} h`);
console.log('Google Sheets sync:         ', sheets ? 'configured' : 'not configured (optional)');
console.log('Email notifications:        ', email ? 'configured' : 'not configured (optional)');
