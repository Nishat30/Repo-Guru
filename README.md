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

