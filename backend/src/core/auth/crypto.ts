import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

const ALGO = "aes-256-gcm";
const KEY_LEN = 32;
const IV_LEN = 12;
const SALT = "adobos-oauth-token";

let cachedKey: Buffer | null = null;
let cachedSecret: string | null = null;

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET must be set (at least 16 characters) to encrypt OAuth tokens.",
    );
  }
  return secret;
}

function deriveKey(): Buffer {
  const secret = sessionSecret();
  if (cachedKey && cachedSecret === secret) return cachedKey;
  cachedKey = scryptSync(secret, SALT, KEY_LEN);
  cachedSecret = secret;
  return cachedKey;
}

/** Cifra un secreto (access/refresh token) en reposo. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, deriveKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(packed: string): string {
  const [ivB64, tagB64, dataB64] = packed.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Token cifrado corrupto.");
  }
  const decipher = createDecipheriv(
    ALGO,
    deriveKey(),
    Buffer.from(ivB64, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
