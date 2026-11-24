import { createHash, createCipheriv, createDecipheriv, randomBytes } from "crypto";

const PLACEHOLDER_SECRETS = new Set([
  "change-me-to-a-long-random-string",
  "change-me",
  "changeme",
  "secret",
  "password",
]);

/** Resolves APP_SECRET / CREDENTIALS_KEY and enforces production-safe length. */
export function requireAppSecret(): string {
  const secret = process.env.APP_SECRET || process.env.CREDENTIALS_KEY;
  if (!secret || secret.length < 32) {
    throw new Error(
      "APP_SECRET (or CREDENTIALS_KEY) must be set to a string of at least 32 characters",
    );
  }
  if (PLACEHOLDER_SECRETS.has(secret.trim().toLowerCase())) {
    throw new Error(
      "APP_SECRET must not use the example placeholder — generate a unique random value",
    );
  }
  return secret;
}

function getKey(): Buffer {
  return createHash("sha256").update(requireAppSecret()).digest();
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

/** Whether a secret is stored — never returns any characters of the value. */
export function maskSecret(value: string | null | undefined): {
  configured: boolean;
} {
  return { configured: Boolean(value) };
}
