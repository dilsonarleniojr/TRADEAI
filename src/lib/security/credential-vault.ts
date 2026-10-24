import crypto from "crypto";

export interface EncryptedPayload {
  ciphertext: string; // Base64
  iv: string;         // Base64 (12 bytes para GCM)
  authTag: string;    // Base64 (16 bytes)
}

/**
 * Cofre Criptográfico Institucional para Chaves de API de Exchanges
 * Utiliza o algoritmo padrão militar AES-256-GCM (Galois/Counter Mode)
 * com autenticação de integridade contra adulteração de bytes.
 */
export class CredentialVault {
  private static readonly ALGORITHM = "aes-256-gcm";
  private static readonly IV_LENGTH_BYTES = 12; // Recomendado para GCM
  private static readonly AUTH_TAG_LENGTH_BYTES = 16;

  /**
   * Obtém a chave mestra de criptografia a partir de variável de ambiente ou chave passada.
   * Se a chave fornecida não tiver 32 bytes (256 bits), deriva deterministicamente via SHA-256.
   */
  private static getDerivedKey(masterKey?: string): Buffer {
    const key = masterKey || process.env.CREDENTIAL_VAULT_KEY || "tradeai-institutional-default-vault-key-32b!";
    if (Buffer.byteLength(key, "utf8") === 32) {
      return Buffer.from(key, "utf8");
    }
    return crypto.createHash("sha256").update(key).digest();
  }

  /**
   * Criptografa dados sensíveis (ex: API Secret da Binance) usando AES-256-GCM.
   */
  public static encrypt(plaintext: string, masterKey?: string): EncryptedPayload {
    if (!plaintext) {
      throw new Error("Plaintext não pode ser vazio para criptografia.");
    }

    const key = this.getDerivedKey(masterKey);
    const iv = crypto.randomBytes(this.IV_LENGTH_BYTES);
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv, {
      authTagLength: this.AUTH_TAG_LENGTH_BYTES,
    });

    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString("base64"),
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
    };
  }

  /**
   * Descriptografa um payload AES-256-GCM e valida sua tag de autenticação.
   * Lança erro se o texto tiver sido adulterado ou se a chave estiver incorreta.
   */
  public static decrypt(payload: EncryptedPayload, masterKey?: string): string {
    if (!payload || !payload.ciphertext || !payload.iv || !payload.authTag) {
      throw new Error("Payload criptográfico incompleto (necessita ciphertext, iv e authTag).");
    }

    const key = this.getDerivedKey(masterKey);
    const iv = Buffer.from(payload.iv, "base64");
    const authTag = Buffer.from(payload.authTag, "base64");
    const ciphertext = Buffer.from(payload.ciphertext, "base64");

    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv, {
      authTagLength: this.AUTH_TAG_LENGTH_BYTES,
    });

    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  }

  /**
   * Mascara uma chave de API para exibição segura na interface (ex: 'vmPU...8a1Z').
   */
  public static maskApiKey(apiKey: string): string {
    if (!apiKey) return "";
    if (apiKey.length <= 8) return "********";
    return `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`;
  }
}
