import { compressBytes, decompressBytes } from "./compression";
import {
  AES_GCM_IV_BYTES,
  AES_KEY_BYTES,
  decryptPayload,
  encryptPayload,
  fromBase64Url,
  toBase64Url,
} from "./crypto";
import { RepoGuruSnapshot, validateSnapshot } from "./schema";

export const SHARE_FORMAT_VERSION = "v1";
export const MAX_SHARE_URL_LENGTH = 32768; // 32 KB safe URL threshold
export const MAX_FRAGMENT_LENGTH = 32000;

export class SnapshotLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotLinkError";
  }
}

export class SnapshotTooLargeError extends SnapshotLinkError {
  readonly urlLength: number;
  readonly maxLength: number;

  constructor(urlLength: number, maxLength: number) {
    super(
      `This snapshot requires ${urlLength.toLocaleString()} characters, exceeding the ${maxLength.toLocaleString()}-character safe URL sharing limit.`
    );
    this.name = "SnapshotTooLargeError";
    this.urlLength = urlLength;
    this.maxLength = maxLength;
  }
}

export interface EncodedShareResult {
  url: string;
  fragment: string;
  urlLength: number;
  rawJsonBytes: number;
  compressedBytes: number;
}

/**
 * Serialize, compress, AES-256-GCM encrypt, and Base64URL-encode a snapshot
 * into a self-contained fragment URL: <origin>/share#v1.<ciphertext>.<iv>.<key>.
 */
export async function encodeSnapshotToShareUrl(
  snapshot: RepoGuruSnapshot,
  origin: string = typeof window !== "undefined" ? window.location.origin : "https://repoguru.app",
  maxUrlLength: number = MAX_SHARE_URL_LENGTH
): Promise<EncodedShareResult> {
  const validated = validateSnapshot(snapshot);
  const jsonText = JSON.stringify(validated);
  const encoder = new TextEncoder();
  const rawBytes = encoder.encode(jsonText);

  const compressed = await compressBytes(rawBytes);
  const { ciphertext, iv, rawKey } = await encryptPayload(compressed);

  const fragment = `${SHARE_FORMAT_VERSION}.${toBase64Url(ciphertext)}.${toBase64Url(
    iv
  )}.${toBase64Url(rawKey)}`;
  const cleanOrigin = origin.replace(/\/+$/, "");
  const url = `${cleanOrigin}/share#${fragment}`;

  if (url.length > maxUrlLength) {
    throw new SnapshotTooLargeError(url.length, maxUrlLength);
  }

  return {
    url,
    fragment,
    urlLength: url.length,
    rawJsonBytes: rawBytes.byteLength,
    compressedBytes: compressed.byteLength,
  };
}

function extractFragment(urlOrFragment: string): string {
  const trimmed = urlOrFragment.trim();
  if (!trimmed) {
    throw new SnapshotLinkError("Missing snapshot link or fragment.");
  }

  if (trimmed.startsWith("#")) {
    return trimmed.slice(1);
  }

  const hashIdx = trimmed.indexOf("#");
  if (hashIdx === -1) {
    // Reject URLs without a fragment or attempting to pass data in query params
    if (trimmed.includes("?")) {
      throw new SnapshotLinkError(
        "Snapshot payload must be in the URL fragment (#), not query parameters."
      );
    }
    throw new SnapshotLinkError("Snapshot URL is missing its encrypted fragment (#).");
  }

  return trimmed.slice(hashIdx + 1);
}

/**
 * Decode, AES-256-GCM decrypt, decompress, and validate a RepoGuru Snapshot URL or fragment.
 */
export async function decodeSnapshotFromShareUrl(
  urlOrFragment: string,
  maxFragmentLength: number = MAX_FRAGMENT_LENGTH
): Promise<RepoGuruSnapshot> {
  const fragment = extractFragment(urlOrFragment);
  if (!fragment) {
    throw new SnapshotLinkError("Snapshot URL fragment is empty.");
  }
  if (fragment.length > maxFragmentLength) {
    throw new SnapshotLinkError(
      `Snapshot fragment exceeds maximum allowed length (${maxFragmentLength} characters).`
    );
  }

  const parts = fragment.split(".");
  if (parts.length !== 4) {
    throw new SnapshotLinkError(
      "Malformed snapshot link format. Expected #v1.<ciphertext>.<iv>.<key>."
    );
  }

  const [version, ciphertextB64, ivB64, keyB64] = parts;
  if (version !== SHARE_FORMAT_VERSION) {
    throw new SnapshotLinkError(`Unsupported snapshot link version: '${version}'.`);
  }
  if (!ciphertextB64 || !ivB64 || !keyB64) {
    throw new SnapshotLinkError("Truncated snapshot link: missing encrypted segments.");
  }

  const ciphertext = fromBase64Url(ciphertextB64);
  const iv = fromBase64Url(ivB64);
  const rawKey = fromBase64Url(keyB64);

  if (iv.byteLength !== AES_GCM_IV_BYTES || rawKey.byteLength !== AES_KEY_BYTES) {
    throw new SnapshotLinkError("Invalid or truncated cryptographic parameters in link.");
  }

  const compressed = await decryptPayload(ciphertext, iv, rawKey);
  const plainBytes = await decompressBytes(compressed);

  let parsed: unknown;
  try {
    const jsonText = new TextDecoder("utf-8", { fatal: true }).decode(plainBytes);
    parsed = JSON.parse(jsonText);
  } catch {
    throw new SnapshotLinkError("Decrypted snapshot is not valid UTF-8 JSON.");
  }

  return validateSnapshot(parsed);
}

