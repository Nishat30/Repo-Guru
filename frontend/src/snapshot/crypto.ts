/**
 * Native Web Crypto API AES-256-GCM encryption and Base64URL encoding.
 * Uses fresh 256-bit keys and 96-bit IVs per snapshot via crypto.getRandomValues().
 */

export const AES_KEY_BYTES = 32; // 256-bit
export const AES_GCM_IV_BYTES = 12; // 96-bit
export const AES_GCM_MIN_CIPHERTEXT_BYTES = 16; // 128-bit auth tag

export class SnapshotCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotCryptoError";
  }
}

export function isWebCryptoSupported(): boolean {
  return (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.getRandomValues === "function" &&
    typeof globalThis.crypto.subtle !== "undefined"
  );
}

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function fromBase64Url(encoded: string): Uint8Array {
  if (!encoded || !BASE64URL_RE.test(encoded)) {
    throw new SnapshotCryptoError("Invalid Base64URL encoding in snapshot payload.");
  }
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const base64 = padded + "=".repeat(padLen);

  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new SnapshotCryptoError("Malformed Base64URL payload.");
  }

  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export interface EncryptedSnapshotParts {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  rawKey: Uint8Array;
}

export async function encryptPayload(plaintext: Uint8Array): Promise<EncryptedSnapshotParts> {
  if (!isWebCryptoSupported()) {
    throw new SnapshotCryptoError("Web Crypto API is unavailable in this browser.");
  }
  if (plaintext.byteLength === 0) {
    throw new SnapshotCryptoError("Cannot encrypt an empty payload.");
  }

  // Fresh 256-bit key and 96-bit IV for every single snapshot
  const rawKey = globalThis.crypto.getRandomValues(new Uint8Array(AES_KEY_BYTES));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));

  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    rawKey as unknown as BufferSource,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const encryptedBuf = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource, tagLength: 128 },
    cryptoKey,
    plaintext as unknown as BufferSource
  );

  return {
    ciphertext: new Uint8Array(encryptedBuf),
    iv,
    rawKey,
  };
}

export async function decryptPayload(
  ciphertext: Uint8Array,
  iv: Uint8Array,
  rawKey: Uint8Array
): Promise<Uint8Array> {
  if (!isWebCryptoSupported()) {
    throw new SnapshotCryptoError("Web Crypto API is unavailable in this browser.");
  }
  if (iv.byteLength !== AES_GCM_IV_BYTES) {
    throw new SnapshotCryptoError("Invalid initialization vector length.");
  }
  if (rawKey.byteLength !== AES_KEY_BYTES) {
    throw new SnapshotCryptoError("Invalid encryption key length.");
  }
  if (ciphertext.byteLength < AES_GCM_MIN_CIPHERTEXT_BYTES) {
    throw new SnapshotCryptoError("Ciphertext is truncated or invalid.");
  }

  try {
    const cryptoKey = await globalThis.crypto.subtle.importKey(
      "raw",
      rawKey as unknown as BufferSource,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    const decryptedBuf = await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as unknown as BufferSource, tagLength: 128 },
      cryptoKey,
      ciphertext as unknown as BufferSource
    );

    return new Uint8Array(decryptedBuf);
  } catch {
    throw new SnapshotCryptoError(
      "Decryption failed. The snapshot link may be corrupted, truncated, or tampered with."
    );
  }
}

