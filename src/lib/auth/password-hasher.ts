/**
 * PasswordHasher
 * --------------
 * Institutional scrypt-based password hashing with cryptographic salt and constant-time comparison.
 * Zero external heavy dependencies; uses native Node.js crypto.
 */

import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';

const KEY_LEN = 64;
const COST = 16384; // N
const BLOCK_SIZE = 8; // r
const PARALLELISM = 1; // p

export class PasswordHasher {
  /**
   * Hashes a plaintext password returning "salt:derivedKey" in hex.
   */
  static hashPassword(password: string): string {
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }
    const salt = randomBytes(16).toString('hex');
    const derivedKey = scryptSync(password, salt, KEY_LEN, {
      N: COST,
      r: BLOCK_SIZE,
      p: PARALLELISM,
    }).toString('hex');

    return `${salt}:${derivedKey}`;
  }

  /**
   * Verifies a password against the stored "salt:derivedKey" using timingSafeEqual.
   */
  static verifyPassword(password: string, storedHash: string): boolean {
    try {
      const parts = storedHash.split(':');
      if (parts.length !== 2) return false;

      const [salt, expectedKeyHex] = parts;
      const expectedBuffer = Buffer.from(expectedKeyHex, 'hex');
      const actualBuffer = scryptSync(password, salt, KEY_LEN, {
        N: COST,
        r: BLOCK_SIZE,
        p: PARALLELISM,
      });

      if (expectedBuffer.length !== actualBuffer.length) return false;
      return timingSafeEqual(expectedBuffer, actualBuffer);
    } catch {
      return false;
    }
  }
}
