/**
 * AuthService
 * -----------
 * Institutional authentication service:
 * - User registration with email/password validation
 * - Scrypt password hashing with unique salt
 * - 2FA TOTP RFC 6238 integration with QR/otpauth URI
 * - HMAC-SHA256 signed session tokens with constant-time verification
 * - Persistent storage in db/users.json
 */

import fs from 'fs';
import path from 'path';
import { createHmac, timingSafeEqual } from 'crypto';
import { PasswordHasher } from './password-hasher';
import { TwoFactorAuth } from '@/lib/security/two-factor-auth';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  twoFactorSecret: string;
  twoFactorEnabled: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface UserPublicProfile {
  id: string;
  name: string;
  email: string;
  twoFactorEnabled: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface SessionTokenPayload {
  userId: string;
  email: string;
  expiresAt: number;
}

const DB_PATH = path.join(process.cwd(), 'db', 'users.json');
const SESSION_SECRET =
  process.env.AUTH_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  'tradeai-institutional-auth-session-key-32b!';

export class AuthService {
  private static usersCache: Map<string, UserRecord> = new Map();
  private static isLoaded = false;

  private static loadUsers(): void {
    if (this.isLoaded) return;
    try {
      if (fs.existsSync(DB_PATH)) {
        const raw = fs.readFileSync(DB_PATH, 'utf-8');
        const list: UserRecord[] = JSON.parse(raw);
        this.usersCache.clear();
        for (const u of list) {
          this.usersCache.set(u.email.toLowerCase(), u);
        }
      }
    } catch {
      this.usersCache.clear();
    }
    this.isLoaded = true;
  }

  private static saveUsers(): void {
    try {
      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const list = Array.from(this.usersCache.values());
      fs.writeFileSync(DB_PATH, JSON.stringify(list, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save users to db/users.json', err);
    }
  }

  /**
   * Registers a new user and generates a 2FA TOTP secret.
   */
  static register(params: {
    name: string;
    email: string;
    password: string;
    enableTwoFactor?: boolean;
  }): {
    user: UserPublicProfile;
    twoFactorSecret: string;
    otpauthUri: string;
    sessionToken: string;
  } {
    this.loadUsers();
    const emailKey = params.email.trim().toLowerCase();

    if (!emailKey.includes('@') || !emailKey.includes('.')) {
      throw new Error('Formato de email inválido.');
    }
    if (this.usersCache.has(emailKey)) {
      throw new Error('Este email já está cadastrado no sistema.');
    }

    const passwordHash = PasswordHasher.hashPassword(params.password);
    const twoFactorData = TwoFactorAuth.generateSecret(emailKey, 'TradeAI Pro');
    const twoFactorSecret = twoFactorData.secret;
    const otpauthUri = twoFactorData.otpauthUri;

    const user: UserRecord = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: params.name.trim() || 'Trader',
      email: emailKey,
      passwordHash,
      twoFactorSecret,
      twoFactorEnabled: params.enableTwoFactor ?? true,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };

    this.usersCache.set(emailKey, user);
    this.saveUsers();

    const sessionToken = this.createSessionToken(user.id, user.email);

    return {
      user: this.toPublicProfile(user),
      twoFactorSecret,
      otpauthUri,
      sessionToken,
    };
  }

  /**
   * Authenticates user with email, password, and optional 2FA TOTP code.
   */
  static login(params: {
    email: string;
    password: string;
    twoFactorCode?: string;
  }): {
    user: UserPublicProfile;
    sessionToken: string;
    requiresTwoFactor: boolean;
  } {
    this.loadUsers();
    const emailKey = params.email.trim().toLowerCase();
    const user = this.usersCache.get(emailKey);

    if (!user) {
      throw new Error('Credenciais inválidas.');
    }

    const isValidPassword = PasswordHasher.verifyPassword(
      params.password,
      user.passwordHash
    );
    if (!isValidPassword) {
      throw new Error('Credenciais inválidas.');
    }

    // Check 2FA
    if (user.twoFactorEnabled) {
      if (!params.twoFactorCode) {
        return {
          user: this.toPublicProfile(user),
          sessionToken: '',
          requiresTwoFactor: true,
        };
      }

      const isOtpValid = TwoFactorAuth.verifyToken(
        params.twoFactorCode,
        user.twoFactorSecret
      );
      if (!isOtpValid) {
        throw new Error('Código de autenticação 2FA inválido ou expirado.');
      }
    }

    user.lastLoginAt = new Date().toISOString();
    this.saveUsers();

    const sessionToken = this.createSessionToken(user.id, user.email);

    return {
      user: this.toPublicProfile(user),
      sessionToken,
      requiresTwoFactor: false,
    };
  }

  /**
   * Validates a session token and returns the corresponding user profile.
   */
  static validateSession(token: string): UserPublicProfile | null {
    this.loadUsers();
    const payload = this.verifySessionToken(token);
    if (!payload) return null;

    const emailKey = payload.email.toLowerCase();
    const user = this.usersCache.get(emailKey);
    if (!user || user.id !== payload.userId) return null;

    return this.toPublicProfile(user);
  }

  // --- Session Token Signatures ---

  static createSessionToken(
    userId: string,
    email: string,
    validityHours: number = 24
  ): string {
    const payload: SessionTokenPayload = {
      userId,
      email,
      expiresAt: Date.now() + validityHours * 3600 * 1000,
    };
    const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', SESSION_SECRET)
      .update(b64Payload)
      .digest('base64url');

    return `${b64Payload}.${signature}`;
  }

  static verifySessionToken(token: string): SessionTokenPayload | null {
    try {
      const [b64Payload, signature] = token.split('.');
      if (!b64Payload || !signature) return null;

      const expectedSignature = createHmac('sha256', SESSION_SECRET)
        .update(b64Payload)
        .digest('base64url');

      const sigBuf = Buffer.from(signature);
      const expBuf = Buffer.from(expectedSignature);

      if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
        return null;
      }

      const payload: SessionTokenPayload = JSON.parse(
        Buffer.from(b64Payload, 'base64url').toString('utf-8')
      );

      if (Date.now() > payload.expiresAt) {
        return null; // Expired
      }

      return payload;
    } catch {
      return null;
    }
  }

  static toPublicProfile(user: UserRecord): UserPublicProfile {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      twoFactorEnabled: user.twoFactorEnabled,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  }

  static clearCacheForTesting(clearDisk = true): void {
    this.usersCache.clear();
    this.isLoaded = true;
    if (clearDisk) {
      try {
        if (fs.existsSync(DB_PATH)) {
          fs.writeFileSync(DB_PATH, '[]', 'utf-8');
        }
      } catch {}
    }
  }
}
