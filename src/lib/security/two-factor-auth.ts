import crypto from "crypto";

export interface TwoFactorSetupData {
  secret: string; // Base32
  otpauthUri: string;
}

/**
 * Autenticação em Dois Fatores Institucional (TOTP - RFC 6238)
 * Compatível com Google Authenticator, Authy e 1Password.
 */
export class TwoFactorAuth {
  private static readonly BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  private static readonly PERIOD_SECONDS = 30;
  private static readonly DIGITS = 6;

  /**
   * Converte Buffer binário para string Base32.
   */
  private static toBase32(buffer: Buffer): string {
    let bits = 0;
    let value = 0;
    let output = "";

    for (let i = 0; i < buffer.length; i++) {
      value = (value << 8) | buffer[i];
      bits += 8;
      while (bits >= 5) {
        output += this.BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }

    if (bits > 0) {
      output += this.BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }

    return output;
  }

  /**
   * Converte string Base32 para Buffer binário.
   */
  private static fromBase32(base32: string): Buffer {
    const clean = base32.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
    let bits = 0;
    let value = 0;
    const bytes: number[] = [];

    for (let i = 0; i < clean.length; i++) {
      const idx = this.BASE32_ALPHABET.indexOf(clean[i]);
      if (idx === -1) {
        throw new Error(`Caractere inválido no segredo Base32: ${clean[i]}`);
      }
      value = (value << 5) | idx;
      bits += 5;

      if (bits >= 8) {
        bytes.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }

    return Buffer.from(bytes);
  }

  /**
   * Gera um novo segredo Base32 criptograficamente seguro e a URI otpauth.
   */
  public static generateSecret(accountEmail = "trader@tradeai.app", issuer = "TradeAI"): TwoFactorSetupData {
    const randomBytes = crypto.randomBytes(20); // 160 bits (RFC 4226 recomendação)
    const secret = this.toBase32(randomBytes);
    const encodedIssuer = encodeURIComponent(issuer);
    const encodedAccount = encodeURIComponent(accountEmail);
    const otpauthUri = `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;

    return { secret, otpauthUri };
  }

  /**
   * Gera o código TOTP de 6 dígitos para um timestamp e segredo específicos.
   */
  public static generateCode(secret: string, timestampMs = Date.now()): string {
    const key = this.fromBase32(secret);
    const timeStep = Math.floor(timestampMs / 1000 / this.PERIOD_SECONDS);

    // Converte timeStep para Big-Endian 64-bit integer
    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeBigUInt64BE(BigInt(timeStep));

    // HMAC-SHA1
    const hmac = crypto.createHmac("sha1", key).update(timeBuffer).digest();

    // Dynamic truncation (RFC 4226 seção 5.4)
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    const code = (binary % 10 ** this.DIGITS).toString().padStart(this.DIGITS, "0");
    return code;
  }

  /**
   * Valida se um token TOTP de 6 dígitos fornecido pelo usuário está correto.
   * Suporta janela de tolerância de relógio (±1 passo = ±30 segundos).
   */
  public static verifyCode(token: string, secret: string, windowSteps = 1, timestampMs = Date.now()): boolean {
    if (!token || token.length !== this.DIGITS || !/^\d+$/.test(token)) {
      return false;
    }

    for (let offset = -windowSteps; offset <= windowSteps; offset++) {
      const stepTime = timestampMs + offset * (this.PERIOD_SECONDS * 1000);
      const expectedCode = this.generateCode(secret, stepTime);
      
      // Comparação em tempo constante para mitigar timing attacks
      if (crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedCode))) {
        return true;
      }
    }

    return false;
  }
}
