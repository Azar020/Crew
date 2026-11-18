import { createHash, randomBytes, timingSafeEqual, scrypt } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

/** Secure password hash using scrypt with random salt */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}

/** Timing-safe password verification */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = parts[1];
  const expectedHex = parts[2];
  if (!salt || !expectedHex) return false;
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  const expectedBuffer = Buffer.from(expectedHex, 'hex');
  if (derivedKey.length !== expectedBuffer.length) return false;
  return timingSafeEqual(derivedKey, expectedBuffer);
}

/**
 * Cryptographic helpers shared by the auth modules.
 *
 * Session/OAuth transaction cookies carry random opaque tokens; only their
 * SHA-256 hashes are persisted. All randomness is CSPRNG-backed
 * (crypto.randomBytes).
 */

/** URL-safe, unpadded random token (base64url). */
export function randomToken(bytes = 32): string {
  if (bytes < 32) {
    throw new RangeError('randomToken requires at least 32 bytes of entropy');
  }
  return randomBytes(bytes).toString('base64url');
}

/** SHA-256 digest as lowercase hex. Used for token lookups and comparisons. */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Constant-time comparison of two same-length strings (e.g. token hashes). */
export function safeEquals(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  if (leftBytes.length !== rightBytes.length) return false;
  return timingSafeEqual(leftBytes, rightBytes);
}
