/**
 * Client-side gzip compression and decompression with decompression-bomb protection.
 */

export const MAX_DECOMPRESSED_BYTES = 2 * 1024 * 1024; // 2 MB hard cap

export class SnapshotCompressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotCompressionError";
  }
}

export function isCompressionSupported(): boolean {
  return (
    typeof CompressionStream !== "undefined" &&
    typeof DecompressionStream !== "undefined"
  );
}

async function readStreamWithLimit(
  stream: ReadableStream<Uint8Array>,
  maxBytes?: number
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;

      totalLength += value.byteLength;
      if (maxBytes !== undefined && totalLength > maxBytes) {
        await reader.cancel("Decompressed payload exceeds safety limit.");
        throw new SnapshotCompressionError(
          `Decompressed snapshot exceeds maximum allowed size (${maxBytes} bytes).`
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export async function compressBytes(input: Uint8Array): Promise<Uint8Array> {
  if (!isCompressionSupported()) {
    throw new SnapshotCompressionError(
      "This browser does not support native CompressionStream gzip compression."
    );
  }
  if (input.byteLength === 0) {
    throw new SnapshotCompressionError("Cannot compress an empty payload.");
  }

  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  const writePromise = writer.write(input as unknown as BufferSource).then(() => writer.close());
  const readPromise = readStreamWithLimit(cs.readable);

  const [, compressed] = await Promise.all([writePromise, readPromise]);
  return compressed;
}

export async function decompressBytes(
  compressed: Uint8Array,
  maxBytes: number = MAX_DECOMPRESSED_BYTES
): Promise<Uint8Array> {
  if (!isCompressionSupported()) {
    throw new SnapshotCompressionError(
      "This browser does not support native DecompressionStream gzip decompression."
    );
  }
  if (compressed.byteLength === 0) {
    throw new SnapshotCompressionError("Compressed snapshot payload is empty.");
  }

  try {
    const ds = new DecompressionStream("gzip");
    const writer = ds.writable.getWriter();
    const writePromise = writer
      .write(compressed as unknown as BufferSource)
      .then(() => writer.close())
      .catch((err) => {
        throw new SnapshotCompressionError(
          err instanceof Error ? err.message : "Corrupted compressed stream."
        );
      });
    const readPromise = readStreamWithLimit(ds.readable, maxBytes);

    const [, decompressed] = await Promise.all([writePromise, readPromise]);
    if (decompressed.byteLength === 0) {
      throw new SnapshotCompressionError("Decompressed snapshot payload is empty.");
    }
    return decompressed;
  } catch (err) {
    if (err instanceof SnapshotCompressionError) {
      throw err;
    }
    throw new SnapshotCompressionError("Failed to decompress snapshot payload.");
  }
}

