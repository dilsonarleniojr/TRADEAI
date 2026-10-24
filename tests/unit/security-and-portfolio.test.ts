import { describe, it, expect } from "bun:test";
import { CredentialVault } from "@/lib/security/credential-vault";
import { TwoFactorAuth } from "@/lib/security/two-factor-auth";
import { SmartPortfolioEngine, AssetHolding, TargetWeight } from "@/lib/portfolio/smart-portfolio-engine";

describe("Segurança Institucional & Smart Portfolio (Fase 2)", () => {
  describe("1. CredentialVault (Cofre Criptográfico AES-256-GCM)", () => {
    it("deve criptografar e descriptografar chaves de API com integridade perfeita", () => {
      const plainSecret = "binance_super_secret_live_trading_api_key_123456789";
      const encrypted = CredentialVault.encrypt(plainSecret);

      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.authTag).toBeDefined();
      expect(encrypted.ciphertext).not.toBe(plainSecret);

      const decrypted = CredentialVault.decrypt(encrypted);
      expect(decrypted).toBe(plainSecret);
    });

    it("deve barrar descriptografia e lançar erro se a authTag ou ciphertext forem adulterados", () => {
      const plainSecret = "api_secret_integrity_test";
      const encrypted = CredentialVault.encrypt(plainSecret);

      // Flipa bit no ciphertext para romper a tag GCM
      const cipherBuf = Buffer.from(encrypted.ciphertext, "base64");
      cipherBuf[0] ^= 0xff;
      const tamperedPayload = { ...encrypted, ciphertext: cipherBuf.toString("base64") };

      expect(() => CredentialVault.decrypt(tamperedPayload)).toThrow();

      // Adultera a tag de autenticação diretamente
      const tagBuf = Buffer.from(encrypted.authTag, "base64");
      tagBuf[0] ^= 0xff;
      const tamperedTagPayload = { ...encrypted, authTag: tagBuf.toString("base64") };

      expect(() => CredentialVault.decrypt(tamperedTagPayload)).toThrow();
    });

    it("deve mascarar chaves de API com segurança para exibição na UI", () => {
      const apiKey = "vmPUF6gahU8MBb3dsh81f62bds89fsa8";
      const masked = CredentialVault.maskApiKey(apiKey);
      expect(masked).toBe("vmPU...fsa8");
    });
  });

  describe("2. TwoFactorAuth (TOTP RFC 6238)", () => {
    it("deve gerar segredo Base32 seguro e URI otpauth formatada para autenticadores", () => {
      const setup = TwoFactorAuth.generateSecret("user@tradeai.org", "TradeAI");
      expect(setup.secret).toBeDefined();
      expect(setup.secret.length).toBeGreaterThanOrEqual(16);
      expect(setup.otpauthUri).toContain("otpauth://totp/TradeAI:user%40tradeai.org");
      expect(setup.otpauthUri).toContain(`secret=${setup.secret}`);
    });

    it("deve gerar código TOTP de 6 dígitos e validar com sucesso o token corrente", () => {
      const setup = TwoFactorAuth.generateSecret();
      const code = TwoFactorAuth.generateCode(setup.secret);

      expect(code).toMatch(/^\d{6}$/);

      const isValid = TwoFactorAuth.verifyCode(code, setup.secret);
      expect(isValid).toBe(true);
    });

    it("deve aceitar janela de tolerância de ±30s e rejeitar códigos falsos", () => {
      const setup = TwoFactorAuth.generateSecret();
      const now = Date.now();
      
      // Código de 30s atrás
      const pastCode = TwoFactorAuth.generateCode(setup.secret, now - 30000);
      expect(TwoFactorAuth.verifyCode(pastCode, setup.secret, 1, now)).toBe(true);

      // Código inválido
      expect(TwoFactorAuth.verifyCode("000000", setup.secret)).toBe(false);
      expect(TwoFactorAuth.verifyCode("abc", setup.secret)).toBe(false);
    });
  });

  describe("3. SmartPortfolioEngine (Rebalanceamento Dinâmico & Monte Carlo)", () => {
    it("não deve acionar rebalanceamento se os desvios estiverem dentro da tolerância", () => {
      const holdings: AssetHolding[] = [
        { symbol: "BTCUSDT", quantity: 0.1, currentPrice: 50000, currentValueUsd: 5000, currentWeight: 0.50 },
        { symbol: "ETHUSDT", quantity: 2.0, currentPrice: 2500, currentValueUsd: 5000, currentWeight: 0.50 },
      ];

      const targets: TargetWeight[] = [
        { symbol: "BTCUSDT", targetWeight: 0.50 },
        { symbol: "ETHUSDT", targetWeight: 0.50 },
      ];

      const plan = SmartPortfolioEngine.evaluateRebalance(holdings, targets, 0.05);

      expect(plan.isRebalanceNeeded).toBe(false);
      expect(plan.totalPortfolioValueUsd).toBe(10000);
      expect(plan.actions.every((a) => a.action === "HOLD")).toBe(true);
    });

    it("deve gerar ações de BUY e SELL com cálculo exato de quantidade e taxas quando houver drift", () => {
      // BTC subiu para 70% e ETH caiu para 30%, alvo é 50/50
      const holdings: AssetHolding[] = [
        { symbol: "BTCUSDT", quantity: 0.14, currentPrice: 50000, currentValueUsd: 7000, currentWeight: 0.70 },
        { symbol: "ETHUSDT", quantity: 1.0, currentPrice: 3000, currentValueUsd: 3000, currentWeight: 0.30 },
      ];

      const targets: TargetWeight[] = [
        { symbol: "BTCUSDT", targetWeight: 0.50 },
        { symbol: "ETHUSDT", targetWeight: 0.50 },
      ];

      const plan = SmartPortfolioEngine.evaluateRebalance(holdings, targets, 0.05);

      expect(plan.isRebalanceNeeded).toBe(true);
      expect(plan.totalPortfolioValueUsd).toBe(10000);

      const btcAction = plan.actions.find((a) => a.symbol === "BTCUSDT");
      const ethAction = plan.actions.find((a) => a.symbol === "ETHUSDT");

      expect(btcAction?.action).toBe("SELL");
      expect(btcAction?.suggestedQuantity).toBe(0.04); // Vende $2000 a $50k
      expect(btcAction?.estimatedFeeUsd).toBe(2.0);    // 0.1% de $2000

      expect(ethAction?.action).toBe("BUY");
      expect(ethAction?.suggestedQuantity).toBeCloseTo(0.666666, 4); // Compra $2000 a $3k
      expect(ethAction?.estimatedFeeUsd).toBe(2.0);

      expect(plan.totalTurnoverUsd).toBe(4000);
      expect(plan.estimatedTotalFeesUsd).toBe(4.0);
    });

    it("deve simular projeção de crescimento Monte Carlo com quantis consistentes", () => {
      const projection = SmartPortfolioEngine.projectGrowth(10000, 0.30, 0.40, 30, 200);

      expect(projection.simulatedPaths).toBe(200);
      expect(projection.days).toBe(30);
      expect(projection.p10ValueUsd).toBeGreaterThan(0);
      expect(projection.p10ValueUsd).toBeLessThanOrEqual(projection.p50ValueUsd);
      expect(projection.p50ValueUsd).toBeLessThanOrEqual(projection.p90ValueUsd);
      expect(projection.probabilityOfProfitPercent).toBeGreaterThan(0);
      expect(projection.probabilityOfProfitPercent).toBeLessThanOrEqual(100);
    });
  });
});
