import * as oidc from 'openid-client';
import { z } from 'zod';
import { allowedHostedDomains, env } from '../../config/env.js';
import { AppError, LoginDeniedError } from '../../shared/errors.js';
import { ALLOWED_EMAIL_DOMAINS } from './constants.js';

/**
 * Google OpenID Connect provider integration.
 *
 * All cryptographic validation (signature, issuer, audience, expiry, nonce,
 * PKCE) is performed by `openid-client` inside `authorizationCodeGrant` —
 * never hand-rolled here. This module additionally enforces the application
 * policy checks: email_verified, exact allowed email domains, and the signed
 * `hd` (hosted domain) claim against a separately configured allowlist.
 */

export const GOOGLE_ISSUER = 'https://accounts.google.com';
export const OIDC_SCOPE = 'openid email profile';

export function isGoogleConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

let configurationPromise: Promise<oidc.Configuration> | null = null;

/**
 * Lazily builds and caches the provider configuration (discovery document +
 * client credentials). Throws 503 when Google credentials are not configured,
 * so login fails closed while unrelated endpoints keep working.
 */
export function getGoogleConfiguration(): Promise<oidc.Configuration> {
  if (!isGoogleConfigured()) {
    throw new LoginNotConfiguredError();
  }
  configurationPromise ??= oidc.discovery(
    new URL(GOOGLE_ISSUER),
    env.GOOGLE_CLIENT_ID as string,
    { client_secret: env.GOOGLE_CLIENT_SECRET as string },
  );
  return configurationPromise;
}

export class LoginNotConfiguredError extends AppError {
  constructor() {
    super('Authentication is not configured', 503);
    this.name = 'LoginNotConfiguredError';
  }
}

export interface AuthorizationRequestMaterials {
  authorizationUrl: URL;
  state: string;
  nonce: string;
  codeVerifier: string;
}

/**
 * Builds a fresh PKCE S256 authorization request. The caller persists
 * state/nonce/verifier in a short-lived transaction bound to the browser.
 */
export async function buildGoogleAuthorizationRequest(): Promise<AuthorizationRequestMaterials> {
  const configuration = await getGoogleConfiguration();
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

  const authorizationUrl = oidc.buildAuthorizationUrl(
    configuration,
    new URLSearchParams({
      redirect_uri: env.OAUTH_REDIRECT_URI,
      scope: OIDC_SCOPE,
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    }),
  );

  return { authorizationUrl, state, nonce, codeVerifier };
}

/** Validated, policy-checked Google identity used for provisioning checks. */
export interface VerifiedGoogleIdentity {
  sub: string;
  email: string;
  name: string | null;
  hostedDomain: string;
}

const idTokenClaimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string().min(3),
  email_verified: z.boolean(),
  name: z.string().min(1).optional(),
  hd: z.string().min(1).optional(),
});

export type IdTokenClaims = z.infer<typeof idTokenClaimsSchema>;

/**
 * Parses the raw (already signature/issuer/audience/expiry/nonce-validated)
 * ID-token claims and enforces application policy:
 *  1. `email_verified` must be true.
 *  2. The email domain must be exactly one of ALLOWED_EMAIL_DOMAINS
 *     (case-insensitive, no subdomains).
 *  3. The signed `hd` claim must be present and equal (case-insensitive) to
 *     one of the separately configured GOOGLE_ALLOWED_HD values. A missing
 *     `hd` (typical for personal Gmail accounts) is rejected.
 *
 * Returns the normalized identity or throws LoginDeniedError.
 */
export function validateGoogleIdentity(
  rawClaims: Record<string, unknown>,
): VerifiedGoogleIdentity {
  const parsedClaims = idTokenClaimsSchema.safeParse(rawClaims);
  if (!parsedClaims.success) {
    throw new LoginDeniedError();
  }
  const { sub, email, email_verified, name, hd } = parsedClaims.data;

  if (!email_verified) {
    throw new LoginDeniedError();
  }

  const normalizedEmail = email.trim().toLowerCase();
  const domain = normalizedEmail.split('@')[1] ?? '';
  if (!(ALLOWED_EMAIL_DOMAINS as readonly string[]).includes(domain)) {
    throw new LoginDeniedError();
  }

  // `hd` is a signed claim from Google; it is NOT derived from the email and
  // the two are not assumed identical. A separately configured allowlist is
  // mandatory — with no allowlist configured, every login is denied.
  const hdAllowlist = allowedHostedDomains().map((d) => d.toLowerCase());
  if (hd === undefined || !hdAllowlist.includes(hd.toLowerCase())) {
    throw new LoginDeniedError();
  }

  return {
    sub,
    email: normalizedEmail,
    name: name?.trim() || null,
    hostedDomain: hd,
  };
}

/**
 * Exchanges the authorization code using the stored PKCE verifier and
 * transaction state/nonce. `openid-client` validates the token response and
 * ID token (signature via JWKS, issuer, audience, expiry, nonce). Returns the
 * policy-validated identity.
 *
 * `callbackUrl` is the ACTUAL callback URL the browser was redirected back
 * on (origin already validated by the caller). Google requires the full
 * authorization-response parameters (including the RFC 9207 `iss` claim) to
 * be present, so the URL is never reconstructed from configuration alone.
 */
export async function exchangeAuthorizationCode(params: {
  callbackUrl: string;
  codeVerifier: string;
  expectedState: string;
  expectedNonce: string;
}): Promise<VerifiedGoogleIdentity> {
  const configuration = await getGoogleConfiguration();

  const currentUrl = new URL(params.callbackUrl);
  if (currentUrl.origin !== new URL(env.OAUTH_REDIRECT_URI).origin) {
    // Defense in depth: the caller checks this too, but the exchange must
    // never run against a URL on a different origin than the registered one.
    throw new LoginDeniedError();
  }

  const tokens = await oidc.authorizationCodeGrant(configuration, currentUrl, {
    pkceCodeVerifier: params.codeVerifier,
    expectedState: params.expectedState,
    expectedNonce: params.expectedNonce,
    idTokenExpected: true,
  });

  const claims = tokens.claims();
  if (!claims) {
    throw new LoginDeniedError();
  }
  return validateGoogleIdentity(claims as unknown as Record<string, unknown>);
}
