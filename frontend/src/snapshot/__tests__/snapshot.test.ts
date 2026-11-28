import { describe, expect, it } from "vitest";
import {
  compressBytes,
  decompressBytes,
  SnapshotCompressionError,
} from "../compression";
import {
  decryptPayload,
  encryptPayload,
  fromBase64Url,
  SnapshotCryptoError,
  toBase64Url,
} from "../crypto";
import {
  serializeSnapshot,
  SnapshotValidationError,
  validateSnapshot,
} from "../schema";
import {
  decodeSnapshotFromShareUrl,
  encodeSnapshotToShareUrl,
  SnapshotLinkError,
  SnapshotTooLargeError,
} from "../shareLink";
import { ArchitectureData, ChatMessageItem, RepoStatus, TreeNode } from "../../types";

function makeSampleInput() {
  const repoStatus: RepoStatus = {
    repo_id: "bb69cc12b4b0",
    url: "https://github.com/pallets/flask",
    owner: "pallets",
    name: "flask",
    status: "ready",
    progress: 100,
    step_message: "Ready",
    file_count: 42,
    chunk_count: 140,
    commit_sha: "abc1234def5678",
  };
  const tree: TreeNode[] = [
    {
      name: "src",
      path: "src",
      type: "dir",
      children: [
        { name: "app.py", path: "src/app.py", type: "file", language: "python", size: 1200 },
      ],
    },
  ];
  const archData: ArchitectureData = {
    repo_id: "bb69cc12b4b0",
    nodes: [{ id: "src/app.py", language: "python", in_degree: 3, out_degree: 1 }],
    edges: [{ source: "src/app.py", target: "src/routing.py" }],
    hub_files: [{ file: "src/app.py", imported_by: 3, imports: 1 }],
    languages: [{ language: "python", percent: 82.5 }],
    stats: { files: 42, edges: 12 },
  };
  const messages: ChatMessageItem[] = [
    { id: "u-1", role: "user", content: "Explain my secret user prompt!" },
    {
      id: "a-1",
      role: "assistant",
      content: "Routing is handled in [[citation:src/app.py:10-25]].",
      citations: [{ file: "src/app.py", start_line: 10, end_line: 25 }],
    },
  ];
  return { repoStatus, tree, archData, messages };
}

describe("Snapshot Cryptography (AES-256-GCM)", () => {
  it("encrypts and decrypts payload with fresh 256-bit key and 96-bit IV", async () => {
    const plain = new TextEncoder().encode("RepoGuru secret snapshot payload");
    const enc1 = await encryptPayload(plain);
    const enc2 = await encryptPayload(plain);

    expect(enc1.rawKey.byteLength).toBe(32);
    expect(enc1.iv.byteLength).toBe(12);
    // Keys and IVs must never be reused
    expect(toBase64Url(enc1.rawKey)).not.toBe(toBase64Url(enc2.rawKey));
    expect(toBase64Url(enc1.iv)).not.toBe(toBase64Url(enc2.iv));

    const dec = await decryptPayload(enc1.ciphertext, enc1.iv, enc1.rawKey);
    expect(new TextDecoder().decode(dec)).toBe("RepoGuru secret snapshot payload");
  });

  it("rejects tampered ciphertext, wrong key, and corrupted IV", async () => {
    const plain = new TextEncoder().encode("Authenticated payload");
    const enc = await encryptPayload(plain);

    const tampered = new Uint8Array(enc.ciphertext);
    tampered[0] ^= 0xff;
    await expect(decryptPayload(tampered, enc.iv, enc.rawKey)).rejects.toThrow(
      SnapshotCryptoError
    );

    const wrongKey = globalThis.crypto.getRandomValues(new Uint8Array(32));
    await expect(decryptPayload(enc.ciphertext, enc.iv, wrongKey)).rejects.toThrow(
      SnapshotCryptoError
    );

    const badIv = new Uint8Array(enc.iv);
    badIv[0] ^= 0x01;
    await expect(decryptPayload(enc.ciphertext, badIv, enc.rawKey)).rejects.toThrow(
      SnapshotCryptoError
    );
  });
});

describe("Snapshot Compression (gzip + bomb protection)", () => {
  it("compresses and decompresses data cleanly", async () => {
    const raw = new TextEncoder().encode(JSON.stringify(makeSampleInput()));
    const compressed = await compressBytes(raw);
    const decompressed = await decompressBytes(compressed);
    expect(new TextDecoder().decode(decompressed)).toBe(new TextDecoder().decode(raw));
  });

  it("rejects empty payloads, invalid compressed bytes, and decompression bombs", async () => {
    await expect(compressBytes(new Uint8Array(0))).rejects.toThrow(SnapshotCompressionError);
    await expect(decompressBytes(new Uint8Array(0))).rejects.toThrow(SnapshotCompressionError);
    await expect(decompressBytes(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(
      SnapshotCompressionError
    );

    // Decompression bomb check: small compressed payload expanding past maxBytes
    const repetitive = new TextEncoder().encode("A".repeat(50000));
    const compressed = await compressBytes(repetitive);
    await expect(decompressBytes(compressed, 1024)).rejects.toThrow(
      SnapshotCompressionError
    );
  });
});

describe("Snapshot Serialization & Schema Validation", () => {
  it("serializes analysis and excludes original user conversation prompts", () => {
    const input = makeSampleInput();
    const snap = serializeSnapshot(input);
    const json = JSON.stringify(snap);

    expect(snap.schemaVersion).toBe(1);
    expect(snap.repository.owner).toBe("pallets");
    expect(snap.mentor.selectedExplanations).toHaveLength(1);
    expect(snap.mentor.selectedExplanations[0].content).toContain("src/app.py:10-25");
    // Must NOT contain user prompt
    expect(json).not.toContain("Explain my secret user prompt!");
  });

  it("rejects unsupported schema versions, missing fields, and unsafe paths/URLs", () => {
    const valid = serializeSnapshot(makeSampleInput());

    expect(() => validateSnapshot({ ...valid, schemaVersion: 99 })).toThrow(
      SnapshotValidationError
    );
    expect(() => validateSnapshot({ schemaVersion: 1 })).toThrow(SnapshotValidationError);
    expect(() =>
      validateSnapshot({
        ...valid,
        repository: { ...valid.repository, url: "javascript:alert(1)" },
      })
    ).toThrow(SnapshotValidationError);
    expect(() =>
      validateSnapshot({
        ...valid,
        analysis: {
          ...valid.analysis,
          tree: [{ name: "evil", path: "../../etc/passwd", type: "file" }],
        },
      })
    ).toThrow(SnapshotValidationError);
  });
});

describe("Snapshot Share Link Codec", () => {
  it("encodes and decodes a full #v1.<ciphertext>.<iv>.<key> URL", async () => {
    const snap = serializeSnapshot(makeSampleInput());
    const encoded = await encodeSnapshotToShareUrl(snap, "https://repoguru.app");

    expect(encoded.url.startsWith("https://repoguru.app/share#v1.")).toBe(true);
    const fragment = encoded.url.split("#")[1];
    expect(fragment.split(".")).toHaveLength(4);
    expect(fromBase64Url(fragment.split(".")[2]).byteLength).toBe(12);
    expect(fromBase64Url(fragment.split(".")[3]).byteLength).toBe(32);

    const restored = await decodeSnapshotFromShareUrl(encoded.url);
    expect(restored.snapshotId).toBe(snap.snapshotId);
    expect(restored.repository.name).toBe("flask");
    expect(restored.analysis.citations).toHaveLength(1);
  });

  it("rejects malformed, missing-fragment, unsupported-version, truncated, and oversized URLs", async () => {
    const snap = serializeSnapshot(makeSampleInput());
    const encoded = await encodeSnapshotToShareUrl(snap, "https://repoguru.app");

    await expect(decodeSnapshotFromShareUrl("https://repoguru.app/share")).rejects.toThrow(
      SnapshotLinkError
    );
    await expect(decodeSnapshotFromShareUrl("https://repoguru.app/share?v=1")).rejects.toThrow(
      SnapshotLinkError
    );
    await expect(decodeSnapshotFromShareUrl("https://repoguru.app/share#v2.abc.def.ghi")).rejects.toThrow(
      SnapshotLinkError
    );
    await expect(decodeSnapshotFromShareUrl(encoded.url.slice(0, -10))).rejects.toThrow();

    await expect(
      encodeSnapshotToShareUrl(snap, "https://repoguru.app", 100)
    ).rejects.toThrow(SnapshotTooLargeError);
  });
});

