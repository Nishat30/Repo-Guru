# RepoGuru AI

**Autonomous Codebase Architect & Bilingual Senior Mentor**

RepoGuru AI lets you paste any public GitHub repository URL and explore it through a three-pane IDE + Claude-inspired mentor interface. It asynchronously shallow-clones the repository, chunks source code into intact syntactic blocks with Tree-sitter ASTs, maps cross-file imports with NetworkX, indexes everything into a Hybrid RAG store (Qdrant + BM25 with Reciprocal Rank Fusion), and orchestrates a LangGraph multi-agent system backed by two custom FastMCP stdio servers (`repo_mcp` and `git_mcp`).

## Key Features

- **Safe Asynchronous Ingestion**: Validates `https://github.com/<owner>/<repo>` URLs, shallow-clones with `core.hooksPath` disabled, enforces size/file limits, and skips binaries and lockfiles.
- **Tree-sitter AST Chunking**: Extracts functions, methods, classes, and interfaces with exact 1-indexed line ranges across Python, JavaScript, TypeScript/TSX, Go, Java, and C++, with overlapping line-window fallback.
- **Hybrid RAG + Dependency Graph**: Combines Qdrant vector search and BM25 keyword search via Reciprocal Rank Fusion (RRF), paired with a NetworkX file-dependency graph.
- **LangGraph + FastMCP Multi-Agent System**:
  - `router` -> parallel `hybrid_rag` & `mcp_explorer` (`repo_mcp` + `git_mcp`) -> `citation_verifier` (with conditional retry loop) -> `senior_mentor`.
  - Streams live agent status pills (`Routing`, `Searching`, `Exploring`, `Verifying`, `Writing`), tokens, and verified `[[citation:file:start-end]]` badges over SSE.
- **Bilingual Senior Mentor**: Toggle between **English** and **Hinglish** (conversational Roman-script Hindi-English with exact English code symbols and CS terms).
- **VS Code + Claude-Style Workspace**: Resizable three-pane layout with keyboard-navigable file explorer, PrismJS syntax viewer with yellow line-range auto-scroll highlighting, architecture dependency modal, and warm light/dark themes.
- **RepoGuru Snapshot (Encrypted Read-Only Sharing)**: Share completed repository analyses via a single self-contained `/share#v1.<ciphertext>.<iv>.<key>` link encrypted client-side with AES-256-GCM—no database or backend snapshot storage required.

## RepoGuru Snapshot

### A. Feature Overview
RepoGuru Snapshot lets you share a completed repository analysis with another person through a single URL. Recipients open `/share#...` in their browser and explore the repository's file tree, dependency graph, language index, verified citations, and captured mentor explanations in strict **read-only** mode—without creating an account, re-running ingestion, or accessing any database.

- **Included**: Repository metadata (`repoId`, `owner`, `name`, `url`, `commitSha`, `fileCount`, `chunkCount`), file explorer tree, dependency graph (`nodes`, `edges`, `hub_files`, `stats`), language statistics, verified citations, optional open file snippets (off by default), and completed assistant explanations.
- **Excluded**: API keys, access tokens, `.env` variables, credentials, user settings, and original user chat prompts.

### B. Architecture
```text
Completed Analysis -> serializeSnapshot() -> validateSnapshot() -> gzip (CompressionStream)
  -> AES-256-GCM Encrypt (Web Crypto) -> Base64URL -> /share#v1.<ciphertext>.<iv>.<key>
```
1. **Client-Side Responsibilities**: Serialization, schema validation, gzip compression, AES-256-GCM encryption/decryption, Base64URL encoding/decoding, and rendering the read-only `SnapshotViewer` at `/share`.
2. **Backend Responsibilities**: None for snapshots. There is **no** snapshot database table, **no** upload endpoint, and **no** retrieval endpoint. URL fragments (`#...`) are never sent to the server in standard HTTP navigation requests.

### C. Cryptographic Implementation
- **Cipher**: Native Web Crypto API `AES-GCM` with a **256-bit** key (`32` bytes) and **128-bit** authentication tag.
- **Key & IV Generation**: Fresh `crypto.getRandomValues()` 256-bit key and 96-bit (`12`-byte) IV generated per snapshot; keys and IVs are never reused or stored on any server.
- **Encoding**: URL-safe Base64URL (`-` / `_`, unpadded) placed strictly in the URL fragment: `/share#v1.<ciphertext>.<iv>.<key>`.
- **Tamper Resistance**: Any modification to the ciphertext, IV, or key fails AES-GCM authentication and is rejected safely.

### D. Data Schema (`schemaVersion: 1`)
Defined and validated in `frontend/src/snapshot/schema.ts`:
- `schemaVersion`: `1` (unsupported versions are rejected explicitly).
- `snapshotId`: UUID v4 generated via `crypto.randomUUID()`.
- `createdAt`: ISO-8601 timestamp.
- `repository`: `{ repoId, owner, name, url, commitSha, fileCount, chunkCount }` (`url` must match `https://github.com/<owner>/<repo>`).
- `analysis`: `{ tree, architecture, languageStatistics, openFiles, citations }` (all paths validated as safe relative paths without `..` or leading `/`).
- `mentor`: `{ selectedExplanations: [{ id, content, citations }] }`.

### E. URL Limitations
- **Threshold**: `MAX_SHARE_URL_LENGTH = 32768` characters (`MAX_FRAGMENT_LENGTH = 32000` characters).
- **Compression**: Serialized JSON is gzip-compressed *before* encryption via `CompressionStream("gzip")`.
- **Oversized Handling**: If a snapshot exceeds `32,768` characters (for example when embedding large open file snippets), RepoGuru throws `SnapshotTooLargeError`, explains why it cannot fit in a URL, and never truncates or uploads to a server.

### F. Security Considerations
- **Bearer Credential**: Anyone possessing the complete `/share#...` URL can decrypt and view the snapshot.
- **No Server Exposure**: The fragment (`#...`) stays client-side; decrypted snapshots are never persisted to `localStorage`, `sessionStorage`, or `IndexedDB`.
- **Untrusted Input Handling**: Strict schema validation rejects unsafe URLs (`javascript:`, `data:`), path-traversal segments (`..`), and unknown fields; `DecompressionStream` enforces a `2 MB` (`MAX_DECOMPRESSED_BYTES`) limit to prevent decompression bombs; zero `eval()` or unsafe HTML execution is used.

### G. Implementation Guide
- `frontend/src/snapshot/schema.ts` — `RepoGuruSnapshot` schema, `serializeSnapshot()`, `validateSnapshot()`
- `frontend/src/snapshot/compression.ts` — `compressBytes()`, `decompressBytes()` with `2 MB` decompression-bomb cap
- `frontend/src/snapshot/crypto.ts` — `encryptPayload()`, `decryptPayload()`, `toBase64Url()`, `fromBase64Url()`
- `frontend/src/snapshot/shareLink.ts` — `encodeSnapshotToShareUrl()`, `decodeSnapshotFromShareUrl()`
- `frontend/src/components/ShareSnapshotModal.tsx` — Share dialog opened from **Share Analysis** in the workspace header
- `frontend/src/components/SnapshotViewer.tsx` — Dedicated read-only `/share` viewer (no AI chat input, no backend fetches)
- **Run Tests**: `cd frontend && npm test`

### H. Known Limitations
- Very large repositories with deep file trees or embedded open file contents can exceed the `32,768`-character URL threshold.
- Requires browsers supporting native Web Crypto (`crypto.subtle`) and `CompressionStream` / `DecompressionStream` (`gzip`).
- Revoking a shared link is not possible once distributed because no central server or database stores snapshots.

## Quick Start (Local Development)

### 1. Backend
```bash
cd backend
cp .env.example .env
# Add your GROQ_API_KEY (with LLM_PROVIDER=groq), OPENAI_API_KEY, or ANTHROPIC_API_KEY in .env
python -m pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173`.

### 3. Run Evaluations
```bash
make eval
```

### 4. Docker Compose
```bash
docker compose up --build
```

