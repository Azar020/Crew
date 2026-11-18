import { describe, expect, it } from 'vitest';
import {
  validateGoogleIdentity,
} from '../src/modules/auth/google.js';
import { isOriginAllowed } from '../src/plugins/http-security.js';
import {
  BootstrapError,
  normalizeBootstrapEmail,
  deriveNameFromEmail,
} from '../src/bootstrap/bootstrap-admin.js';
import { LoginDeniedError } from '../src/shared/errors.js';

describe('Google identity policy validation', () => {
  const baseClaims = {
    sub: 'google-sub-1',
    email: 'alice@transacty.ai',
    email_verified: true,
    name: 'Alice Adams',
    hd: 'transacty.ai',
  };

  it('accepts a verified Workspace identity from an allowed domain', () => {
    const identity = validateGoogleIdentity(baseClaims);
    expect(identity.sub).toBe('google-sub-1');
    expect(identity.email).toBe('alice@transacty.ai');
    expect(identity.hostedDomain).toBe('transacty.ai');
  });

  it('rejects unverified email addresses', () => {
    expect(() =>
      validateGoogleIdentity({ ...baseClaims, email_verified: false }),
    ).toThrow(LoginDeniedError);
  });

  it('rejects missing email_verified claim', () => {
    const { email_verified: _removed, ...claims } = baseClaims;
    expect(() => validateGoogleIdentity(claims)).toThrow(LoginDeniedError);
  });

  it('rejects external and lookalike email domains (exact match only)', () => {
    expect(() =>
      validateGoogleIdentity({ ...baseClaims, email: 'alice@gmail.com' }),
    ).toThrow(LoginDeniedError);
    expect(() =>
      validateGoogleIdentity({ ...baseClaims, email: 'alice@eviltransacty.ai' }),
    ).toThrow(LoginDeniedError);
    // subdomains are not accepted either
    expect(() =>
      validateGoogleIdentity({ ...baseClaims, email: 'alice@mail.transacty.ai' }),
    ).toThrow(LoginDeniedError);
    expect(() =>
      validateGoogleIdentity({ ...baseClaims, email: 'alice@n23digitals.com' }),
    ).not.toThrow();
  });

  it('rejects a missing hd claim (personal Gmail identity)', () => {
    const { hd: _removed, ...claims } = baseClaims;
    expect(() => validateGoogleIdentity(claims)).toThrow(LoginDeniedError);
  });

  it('rejects an hd claim outside the configured allowlist', () => {
    expect(() =>
      validateGoogleIdentity({ ...baseClaims, hd: 'gmail.com' }),
    ).toThrow(LoginDeniedError);
    expect(() =>
      validateGoogleIdentity({ ...baseClaims, hd: 'transacty.com' }),
    ).toThrow(LoginDeniedError);
  });

  it('rejects malformed claims (missing sub/email)', () => {
    expect(() => validateGoogleIdentity({ email_verified: true })).toThrow(
      LoginDeniedError,
    );
  });

  it('is case-insensitive for email domains and hd values', () => {
    expect(() =>
      validateGoogleIdentity({
        ...baseClaims,
        email: 'ALICE@TRANSACTY.AI',
        hd: 'Transacty.AI',
      }),
    ).not.toThrow();
  });
});

describe('Origin validation policy', () => {
  const allowed = ['http://127.0.0.1:3000', 'https://app.transacty.ai'];

  it('allows missing Origin (non-browser clients; CSRF token still enforced)', () => {
    expect(isOriginAllowed(undefined, allowed)).toBe(true);
  });

  it('allows exact configured origins', () => {
    expect(isOriginAllowed('http://127.0.0.1:3000', allowed)).toBe(true);
  });

  it('rejects unapproved and near-miss origins', () => {
    expect(isOriginAllowed('http://evil.example', allowed)).toBe(false);
    // port mismatch
    expect(isOriginAllowed('http://127.0.0.1:3001', allowed)).toBe(false);
    // scheme downgrade
    expect(isOriginAllowed('https://127.0.0.1:3000', allowed)).toBe(false);
  });
});

describe('Bootstrap input validation', () => {
  it('normalizes emails to lowercase', () => {
    expect(normalizeBootstrapEmail('Alice@Transacty.AI')).toBe('alice@transacty.ai');
  });

  it('accepts both company domains', () => {
    expect(() => normalizeBootstrapEmail('a@transacty.ai')).not.toThrow();
    expect(() => normalizeBootstrapEmail('b@n23digitals.com')).not.toThrow();
  });

  it('rejects invalid emails and disallowed domains', () => {
    expect(() => normalizeBootstrapEmail('not-an-email')).toThrow(BootstrapError);
    try {
      normalizeBootstrapEmail('a@gmail.com');
      expect.unreachable('expected BootstrapError');
    } catch (error) {
      expect(error).toBeInstanceOf(BootstrapError);
      expect((error as BootstrapError).reason).toBe('disallowed-domain');
    }
  });

  it('derives a display name from the email when none is given', () => {
    expect(deriveNameFromEmail('alice.adams@transacty.ai')).toBe('Alice Adams');
    expect(deriveNameFromEmail('bob_jones@transacty.ai')).toBe('Bob Jones');
  });
});
