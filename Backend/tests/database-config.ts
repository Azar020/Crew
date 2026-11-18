// Override only with an explicitly isolated loopback test database. Never use DATABASE_URL.
export const TEST_DATABASE_URL = process.env.TEAMDESK_TEST_DATABASE_URL
  ?? 'postgresql://teamdesk:teamdesk@localhost:5432/teamdesk_test';
const target = new URL(TEST_DATABASE_URL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
  || target.pathname !== '/teamdesk_test') {
  throw new Error('Tests require a loopback database named teamdesk_test');
}
