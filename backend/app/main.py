"""FastAPI application entrypoint, REST endpoints, and SSE streaming chat endpoint."""

import asyncio
import hashlib
import json
import logging
import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.agents.graph import repoguru_graph
from app.core.config import get_settings
from app.core.database import Repository, get_db, init_db
from app.core.llm import has_llm_credentials
from app.ingestion.cloner import build_file_tree, detect_language, is_binary_file, parse_github_url
from app.ingestion.dep_graph import get_architecture_overview
from app.ingestion.indexer import hybrid_search
from app.ingestion.pipeline import run_ingestion_pipeline

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

REPO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
STAGE_LABELS = {
    "router": "Routing",
    "hybrid_rag": "Searching",
    "mcp_explorer": "Exploring",
    "citation_verifier": "Verifying",
    "senior_mentor": "Writing",
}

_background_tasks: set[asyncio.Task[Any]] = set()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Initialize database and required local directories on startup."""
    await init_db()
    yield


settings = get_settings()
app = FastAPI(
    title="RepoGuru AI",
    description="Autonomous Codebase Architect & Bilingual Senior Mentor",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class IngestRequest(BaseModel):
    url: str = Field(..., description="Public GitHub repository URL")


class IngestResponse(BaseModel):
    repo_id: str
    owner: str
    name: str
    status: str
    progress: int
    step_message: str


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatStreamRequest(BaseModel):
    repo_id: str
    question: str = Field(..., min_length=1, max_length=4000)
    language_mode: Literal["english", "hinglish"] = "english"
    chat_history: list[ChatMessage] = Field(default_factory=list)


def _validate_repo_id(repo_id: str) -> str:
    if not REPO_ID_RE.match(repo_id):
        raise HTTPException(status_code=400, detail="Invalid repository ID.")
    return repo_id


def _resolve_repo_workspace(repo_id: str) -> Path:
    _validate_repo_id(repo_id)
    workspaces_root = settings.workspaces_dir.resolve()
    workspace = (workspaces_root / repo_id).resolve()
    if not workspace.is_relative_to(workspaces_root) or workspace == workspaces_root:
        raise HTTPException(status_code=403, detail="Invalid workspace path.")
    if not workspace.exists():
        raise HTTPException(status_code=404, detail="Repository workspace not found.")
    return workspace


def _extract_token_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(str(block.get("text", "")))
            elif isinstance(block, str):
                parts.append(block)
        return "".join(parts)
    return ""


@app.get("/api/health")
async def health_check() -> dict[str, Any]:
    """Health check endpoint."""
    return {
        "status": "ok",
        "llm_provider": settings.llm_provider,
        "llm_configured": has_llm_credentials(),
    }


@app.post("/api/repos/ingest", response_model=IngestResponse)
async def ingest_repository(
    payload: IngestRequest,
    db: AsyncSession = Depends(get_db),
) -> IngestResponse:
    """Validate GitHub URL and launch asynchronous repository ingestion."""
    try:
        owner, name = parse_github_url(payload.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    canonical_url = f"https://github.com/{owner}/{name}"
    repo_id = hashlib.sha256(canonical_url.lower().encode("utf-8")).hexdigest()[:12]
    workspace_path = str((settings.workspaces_dir / repo_id).resolve())

    result = await db.execute(select(Repository).where(Repository.id == repo_id))
    existing = result.scalar_one_or_none()

    if existing and existing.status == "ready" and Path(existing.workspace_path).exists():
        return IngestResponse(
            repo_id=existing.id,
            owner=existing.owner,
            name=existing.name,
            status=existing.status,
            progress=existing.progress,
            step_message=existing.step_message,
        )

    if existing:
        existing.status = "queued"
        existing.progress = 5
        existing.step_message = "Queued for ingestion..."
        existing.error_message = None
        existing.workspace_path = workspace_path
    else:
        existing = Repository(
            id=repo_id,
            url=canonical_url,
            owner=owner,
            name=name,
            status="queued",
            progress=5,
            step_message="Queued for ingestion...",
            workspace_path=workspace_path,
        )
        db.add(existing)

    await db.commit()

    task = asyncio.create_task(run_ingestion_pipeline(repo_id, canonical_url))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

    return IngestResponse(
        repo_id=repo_id,
        owner=owner,
        name=name,
        status="queued",
        progress=5,
        step_message="Queued for ingestion...",
    )


@app.get("/api/repos/{repo_id}/status")
async def get_repo_status(
    repo_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Return current ingestion status and repository metadata."""
    _validate_repo_id(repo_id)
    result = await db.execute(select(Repository).where(Repository.id == repo_id))
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found.")

    return {
        "repo_id": repo.id,
        "url": repo.url,
        "owner": repo.owner,
        "name": repo.name,
        "status": repo.status,
        "progress": repo.progress,
        "step_message": repo.step_message,
        "error_message": repo.error_message,
        "file_count": repo.file_count,
        "chunk_count": repo.chunk_count,
        "commit_sha": repo.commit_sha,
    }


@app.get("/api/repos/{repo_id}/tree")
async def get_repo_tree(repo_id: str) -> dict[str, Any]:
    """Return nested file tree for the ingested repository."""
    workspace = _resolve_repo_workspace(repo_id)
    tree = await asyncio.to_thread(build_file_tree, workspace)
    return {"repo_id": repo_id, "tree": tree}


@app.get("/api/repos/{repo_id}/file")
async def get_repo_file(
    repo_id: str,
    path: str = Query(..., min_length=1),
) -> dict[str, Any]:
    """Safely read a repository file's contents for the code viewer."""
    workspace = _resolve_repo_workspace(repo_id)
    clean_path = path.strip().lstrip("/")
    target = (workspace / clean_path).resolve()

    if not target.is_relative_to(workspace):
        raise HTTPException(status_code=403, detail="Path traversal blocked.")
    if not target.is_file():
        raise HTTPException(status_code=404, detail="File not found.")
    if is_binary_file(target):
        raise HTTPException(status_code=400, detail="Binary files cannot be displayed.")

    content = target.read_text(encoding="utf-8", errors="replace")
    rel = target.relative_to(workspace).as_posix()
    return {
        "repo_id": repo_id,
        "path": rel,
        "language": detect_language(target),
        "line_count": len(content.splitlines()),
        "content": content,
    }


@app.get("/api/repos/{repo_id}/architecture")
async def get_repo_architecture(repo_id: str) -> dict[str, Any]:
    """Return dependency graph nodes, edges, and hub files."""
    _resolve_repo_workspace(repo_id)
    overview = await asyncio.to_thread(get_architecture_overview, repo_id)
    return {"repo_id": repo_id, **overview}


@app.get("/api/repos/{repo_id}/search")
async def search_repo_code(
    repo_id: str,
    q: str = Query(..., min_length=1, max_length=300),
    top_k: int = Query(12, ge=1, le=30),
) -> dict[str, Any]:
    """Run Hybrid RAG search for the left sidebar Search panel."""
    _resolve_repo_workspace(repo_id)
    results = await asyncio.to_thread(hybrid_search, repo_id, q, top_k)
    return {"repo_id": repo_id, "query": q, "results": results}


@app.post("/api/chat/stream")
async def stream_chat(
    payload: ChatStreamRequest,
    db: AsyncSession = Depends(get_db),
) -> EventSourceResponse:
    """Stream LangGraph agent progress, tokens, and verified citations via SSE."""
    _validate_repo_id(payload.repo_id)
    result = await db.execute(select(Repository).where(Repository.id == payload.repo_id))
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found.")
    if repo.status != "ready":
        raise HTTPException(
            status_code=409,
            detail=f"Repository is not ready yet (current status: {repo.status}).",
        )

    async def event_generator():
        if not has_llm_credentials():
            yield {
                "event": "error",
                "data": json.dumps(
                    {
                        "message": (
                            f"LLM API key not configured for provider '{settings.llm_provider}'. "
                            "Add GROQ_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY in backend/.env."
                        )
                    }
                ),
            }
            return

        initial_state = {
            "repo_id": payload.repo_id,
            "question": payload.question,
            "language_mode": payload.language_mode,
            "chat_history": [m.model_dump() for m in payload.chat_history],
            "retry_count": 0,
            "status_events": [],
        }

        emitted_stages: set[str] = set()
        verified_citations: list[dict[str, Any]] = []
        streamed_any_token = False

        try:
            async for event in repoguru_graph.astream_events(initial_state, version="v2"):
                kind = event.get("event", "")
                name = event.get("name", "")
                metadata = event.get("metadata", {})

                if kind == "on_chain_start" and name in STAGE_LABELS:
                    stage = STAGE_LABELS[name]
                    if stage not in emitted_stages or stage in {"Exploring", "Verifying"}:
                        emitted_stages.add(stage)
                        yield {
                            "event": "status",
                            "data": json.dumps({"stage": stage}),
                        }

                elif kind == "on_chat_model_stream" and metadata.get("langgraph_node") == "senior_mentor":
                    chunk = event.get("data", {}).get("chunk")
                    if chunk is not None:
                        text = _extract_token_text(getattr(chunk, "content", ""))
                        if text:
                            streamed_any_token = True
                            yield {
                                "event": "token",
                                "data": json.dumps({"token": text}),
                            }

                elif kind == "on_chain_end" and name == "senior_mentor":
                    output = event.get("data", {}).get("output") or {}
                    if isinstance(output, dict):
                        verified_citations = output.get("verified_citations", [])
                        if not streamed_any_token and output.get("final_answer"):
                            yield {
                                "event": "token",
                                "data": json.dumps({"token": output["final_answer"]}),
                            }

            yield {
                "event": "citations",
                "data": json.dumps({"citations": verified_citations}),
            }
            yield {
                "event": "done",
                "data": json.dumps({"status": "complete"}),
            }
        except Exception as exc:
            logger.exception("Error during chat stream for repo %s", payload.repo_id)
            yield {
                "event": "error",
                "data": json.dumps({"message": str(exc)}),
            }

    return EventSourceResponse(event_generator())

