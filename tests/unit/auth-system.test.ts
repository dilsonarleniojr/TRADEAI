import { describe, expect, it, beforeEach } from 'bun:test';
import { PasswordHasher } from '@/lib/auth/password-hasher';
import { AuthService } from '@/lib/auth/auth-service';
import { TwoFactorAuth } from '@/lib/security/two-factor-auth';

describe('Institutional Authentication & Password Security', () => {
  describe('PasswordHasher (Scrypt + Salt + TimingSafe)', () => {
    it('should hash a password and verify it successfully', () => {
      const password = 'StrongPassword123!';
      const hash = PasswordHasher.hashPassword(password);

      expect(hash).toContain(':');
      const [salt, key] = hash.split(':');
      expect(salt.length).toBe(32); // 16 bytes in hex
      expect(key.length).toBe(128); // 64 bytes in hex

      const isValid = PasswordHasher.verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect passwords', () => {
      const hash = PasswordHasher.hashPassword('SuperSecret999#');
      const isValid = PasswordHasher.verifyPassword('WrongPassword', hash);
      expect(isValid).toBe(false);
    });

    it('should reject passwords shorter than 8 characters', () => {
      expect(() => PasswordHasher.hashPassword('short')).toThrow(
        /at least 8 characters/
      );
    });
  });

  describe('AuthService (Registration, 2FA TOTP & Session Tokens)', () => {
    beforeEach(() => {
      AuthService.clearCacheForTesting();
    });

    it('should register a new user and generate valid 2FA TOTP credentials', () => {
      const reg = AuthService.register({
        name: 'Dilson Quant',
        email: 'quant@tradeai.org',
        password: 'SecureTraderPass2026!',
        enableTwoFactor: true,
      });

      expect(reg.user.name).toBe('Dilson Quant');
      expect(reg.user.email).toBe('quant@tradeai.org');
      expect(reg.user.twoFactorEnabled).toBe(true);
      expect(reg.twoFactorSecret).toBeDefined();
      expect(reg.twoFactorSecret.length).toBeGreaterThanOrEqual(16);
      expect(reg.otpauthUri).toContain('otpauth://totp/TradeAI%20Pro');
      expect(reg.sessionToken).toContain('.');
    });

    it('should reject registration with duplicate email', () => {
      AuthService.register({
        name: 'Trader 1',
        email: 'duplicate@tradeai.org',
        password: 'Password123!',
      });

      expect(() =>
        AuthService.register({
          name: 'Trader 2',
          email: 'duplicate@tradeai.org',
          password: 'Password456!',
        })
      ).toThrow(/já está cadastrado/);
    });

    it('should require 2FA TOTP code on login when 2FA is enabled', () => {
      const reg = AuthService.register({
        name: 'Safe Trader',
        email: 'safe@tradeai.org',
        password: 'Password123!',
        enableTwoFactor: true,
      });

      const initialLogin = AuthService.login({
        email: 'safe@tradeai.org',
        password: 'Password123!',
      });

      expect(initialLogin.requiresTwoFactor).toBe(true);
      expect(initialLogin.sessionToken).toBe('');

      // Now generate a valid 6-digit TOTP code using TwoFactorAuth
      const validCode = TwoFactorAuth.generateToken(reg.twoFactorSecret);
      const secondLogin = AuthService.login({
        email: 'safe@tradeai.org',
        password: 'Password123!',
        twoFactorCode: validCode,
      });

      expect(secondLogin.requiresTwoFactor).toBe(false);
      expect(secondLogin.sessionToken).toBeDefined();
      expect(secondLogin.sessionToken.length).toBeGreaterThan(20);
    });

    it('should reject login with wrong 2FA TOTP code', () => {
      AuthService.register({
        name: 'Strict Trader',
        email: 'strict@tradeai.org',
        password: 'Password123!',
        enableTwoFactor: true,
      });

      expect(() =>
        AuthService.login({
          email: 'strict@tradeai.org',
          password: 'Password123!',
          twoFactorCode: '000000',
        })
      ).toThrow(/Código de autenticação 2FA inválido/);
    });

    it('should reject login with incorrect password', () => {
      AuthService.register({
        name: 'Trader',
        email: 'loginfail@tradeai.org',
        password: 'Password123!',
      });

      expect(() =>
        AuthService.login({
          email: 'loginfail@tradeai.org',
          password: 'WrongPassword!',
        })
      ).toThrow(/Credenciais inválidas/);
    });

    it('should create and validate HMAC-SHA256 session tokens', () => {
      const token = AuthService.createSessionToken('usr-101', 'token@tradeai.org');
      const payload = AuthService.verifySessionToken(token);

      expect(payload).not.toBeNull();
      expect(payload?.userId).toBe('usr-101');
      expect(payload?.email).toBe('token@tradeai.org');

      // Tampering should be rejected
      const tampered = token.replace(/^ey/, 'ez');
      expect(AuthService.verifySessionToken(tampered)).toBeNull();
    });
  });
});
