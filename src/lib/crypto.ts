import { createHash, createCipheriv, createDecipheriv, randomBytes } from "crypto";

function getKey(): Buffer {
  const secret = process.env.APP_SECRET || process.env.CREDENTIALS_KEY;
  if (!secret || secret.length < 16) {
    throw new Error(
      "APP_SECRET (or CREDENTIALS_KEY) must be set to a string of at least 16 characters",
    );
  }
  return createHash("sha256").update(secret).digest();
}

/** Encrypt plaintext to `iv:tag:ciphertext` (base64 parts). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted payload");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function maskSecret(value: string | null | undefined): {
  configured: boolean;
  last4: string | null;
} {
  if (!value) return { configured: false, last4: null };
  const last4 = value.length <= 4 ? "****" : value.slice(-4);
  return { configured: true, last4 };
}
