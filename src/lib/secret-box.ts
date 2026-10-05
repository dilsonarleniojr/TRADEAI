import crypto from "crypto";
import fs from "fs";
import path from "path";

// Criptografia de segredos guardados pelo servidor (AES-256-GCM).
// Produção: chave derivada de SESSION_SECRET. Desenvolvimento: chave local em .data/session.key (fora do git).

let cachedKey: Buffer | null = null;

export function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const envSecret = process.env.SESSION_SECRET;
  if (envSecret && envSecret.length >= 32) {
    cachedKey = crypto.createHash("sha256").update(envSecret).digest();
    return cachedKey;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET (mín. 32 caracteres) é obrigatório em produção.");
  }

  const dir = path.join(process.cwd(), ".data");
  const file = path.join(dir, "session.key");
  try {
    cachedKey = Buffer.from(fs.readFileSync(file, "utf8").trim(), "hex");
    if (cachedKey.length === 32) return cachedKey;
  } catch {
    // arquivo ainda não existe
  }
  cachedKey = crypto.randomBytes(32);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, cachedKey.toString("hex"), { mode: 0o600 });
  return cachedKey;
}

export function sealSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}

/** Devolve null se o conteúdo foi adulterado ou cifrado com outra chave. */
export function openSecret(token: string): string | null {
  try {
    const raw = Buffer.from(token, "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
