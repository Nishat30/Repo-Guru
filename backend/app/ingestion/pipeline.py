"""Background async ingestion orchestrator updating repository status in SQLite."""

import asyncio
import logging
from pathlib import Path

from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal, Repository
from app.ingestion.ast_chunker import CodeChunk, chunk_file
from app.ingestion.cloner import collect_source_files, safe_shallow_clone
from app.ingestion.dep_graph import build_and_save_dep_graph
from app.ingestion.indexer import index_chunks

logger = logging.getLogger(__name__)


async def _update_repo_status(
    repo_id: str,
    status: str,
    progress: int,
    step_message: str,
    **extra: object,
) -> None:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Repository).where(Repository.id == repo_id))
        repo = result.scalar_one_or_none()
        if not repo:
            return
        repo.status = status
        repo.progress = progress
        repo.step_message = step_message
        for key, value in extra.items():
            if hasattr(repo, key):
                setattr(repo, key, value)
        await session.commit()


async def run_ingestion_pipeline(repo_id: str, url: str) -> None:
    """Execute clone -> AST parse -> dependency graph -> hybrid RAG indexing."""
    settings = get_settings()
    workspace_dir = (settings.workspaces_dir / repo_id).resolve()

    try:
        # Step 1: Cloning
        await _update_repo_status(repo_id, "cloning", 15, "Shallow-cloning repository...")
        commit_sha = await asyncio.to_thread(
            safe_shallow_clone,
            url,
            workspace_dir,
            settings.clone_timeout_seconds,
            settings.max_repo_size_mb,
            settings.max_file_count,
        )

        # Step 2: Parsing ASTs
        await _update_repo_status(
            repo_id,
            "parsing",
            45,
            "Parsing source files into Tree-sitter AST blocks...",
            commit_sha=commit_sha,
        )
        files = await asyncio.to_thread(collect_source_files, workspace_dir, settings.max_file_count)

        def _parse_all() -> list[CodeChunk]:
            all_chunks: list[CodeChunk] = []
            for f in files:
                all_chunks.extend(
                    chunk_file(
                        file_path=f["path"],
                        content=f["content"],
                        language=f["language"],
                        file_sha256=f["sha256"],
                    )
                )
            return all_chunks

        chunks = await asyncio.to_thread(_parse_all)

        # Step 3: Building dependency graph
        await _update_repo_status(
            repo_id,
            "building_graph",
            70,
            f"Building dependency graph across {len(files)} files...",
            file_count=len(files),
        )
        await asyncio.to_thread(build_and_save_dep_graph, repo_id, files)

        # Step 4: Indexing into Hybrid RAG (Qdrant + BM25)
        await _update_repo_status(
            repo_id,
            "indexing",
            85,
            f"Indexing {len(chunks)} AST chunks into Qdrant & BM25...",
            chunk_count=len(chunks),
        )
        indexed_count = await asyncio.to_thread(index_chunks, repo_id, chunks)

        # Complete
        await _update_repo_status(
            repo_id,
            "ready",
            100,
            "Repository indexed and ready for mentoring.",
            file_count=len(files),
            chunk_count=indexed_count,
        )
    except Exception as exc:
        logger.exception("Ingestion failed for repo %s", repo_id)
        await _update_repo_status(
            repo_id,
            "failed",
            0,
            "Ingestion failed.",
            error_message=str(exc),
        )
