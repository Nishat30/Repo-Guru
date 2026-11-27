"""Hybrid Qdrant vector + BM25 keyword indexer and Reciprocal Rank Fusion retriever."""

import atexit
import json
import re
import uuid
from functools import lru_cache
from typing import Any

from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels
from rank_bm25 import BM25Okapi

from app.core.config import get_settings
from app.core.llm import get_embeddings_model
from app.ingestion.ast_chunker import CodeChunk

TOKEN_SPLIT_RE = re.compile(r"[A-Za-z0-9_]+")
_BM25_CACHE: dict[str, tuple[float, list[dict[str, Any]], BM25Okapi]] = {}


def _tokenize(text: str) -> list[str]:
    """Tokenize code/text preserving snake_case and splitting camelCase."""
    raw_tokens = TOKEN_SPLIT_RE.findall(text)
    tokens: list[str] = []
    for tok in raw_tokens:
        tokens.append(tok.lower())
        # Split camelCase subtokens for better identifier recall
        parts = re.sub(r"([a-z])([A-Z])", r"\1 \2", tok).split()
        if len(parts) > 1:
            tokens.extend(p.lower() for p in parts)
    return tokens


@lru_cache(maxsize=1)
def get_qdrant_client() -> QdrantClient:
    """Return a singleton QdrantClient (remote URL or local persistent path)."""
    settings = get_settings()
    if settings.qdrant_url:
        client = QdrantClient(url=settings.qdrant_url)
    else:
        settings.ensure_dirs()
        client = QdrantClient(path=str(settings.qdrant_dir))
    atexit.register(client.close)
    return client


def _collection_name(repo_id: str) -> str:
    return f"repo_{repo_id}"


def index_chunks(repo_id: str, chunks: list[CodeChunk]) -> int:
    """Index code chunks into both Qdrant vector store and BM25 keyword store."""
    if not chunks:
        return 0

    settings = get_settings()
    embeddings_model, dim = get_embeddings_model()
    client = get_qdrant_client()
    collection = _collection_name(repo_id)

    if client.collection_exists(collection):
        client.delete_collection(collection)

    client.create_collection(
        collection_name=collection,
        vectors_config=qmodels.VectorParams(size=dim, distance=qmodels.Distance.COSINE),
    )

    texts_for_embedding = [
        f"File: {c.file_path} | Symbol: {c.symbol_name} ({c.node_type})\n{c.content}"
        for c in chunks
    ]

    # Embed in batches to respect provider payload limits
    batch_size = 64
    vectors: list[list[float]] = []
    for i in range(0, len(texts_for_embedding), batch_size):
        batch = texts_for_embedding[i : i + batch_size]
        vectors.extend(embeddings_model.embed_documents(batch))

    points: list[qmodels.PointStruct] = []
    bm25_records: list[dict[str, Any]] = []
    tokenized_corpus: list[list[str]] = []

    for idx, (chunk, vec) in enumerate(zip(chunks, vectors)):
        payload = {
            "chunk_idx": idx,
            "file_path": chunk.file_path,
            "start_line": chunk.start_line,
            "end_line": chunk.end_line,
            "language": chunk.language,
            "symbol_name": chunk.symbol_name,
            "node_type": chunk.node_type,
            "content": chunk.content,
            "file_sha256": chunk.file_sha256,
        }
        points.append(
            qmodels.PointStruct(
                id=str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{repo_id}:{idx}")),
                vector=vec,
                payload=payload,
            )
        )
        bm25_records.append(payload)
        tokenized_corpus.append(_tokenize(f"{chunk.file_path} {chunk.symbol_name} {chunk.content}"))

    for i in range(0, len(points), 128):
        client.upsert(collection_name=collection, points=points[i : i + 128])

    bm25_path = settings.bm25_dir / f"{repo_id}.json"
    bm25_path.write_text(
        json.dumps({"records": bm25_records, "tokenized": tokenized_corpus}),
        encoding="utf-8",
    )

    return len(chunks)


def hybrid_search(repo_id: str, query: str, top_k: int = 8) -> list[dict[str, Any]]:
    """Run Qdrant vector search + BM25 keyword search and fuse with Reciprocal Rank Fusion."""
    settings = get_settings()
    collection = _collection_name(repo_id)
    client = get_qdrant_client()

    rrf_k = 60
    fused_scores: dict[str, float] = {}
    chunk_by_key: dict[str, dict[str, Any]] = {}

    def _chunk_key(item: dict[str, Any]) -> str:
        return f"{item['file_path']}:{item['start_line']}-{item['end_line']}"

    # 1. Vector search via Qdrant
    if client.collection_exists(collection):
        embeddings_model, _ = get_embeddings_model()
        query_vec = embeddings_model.embed_query(query)
        response = client.query_points(
            collection_name=collection,
            query=query_vec,
            limit=top_k * 2,
            with_payload=True,
        )
        for rank, point in enumerate(response.points, start=1):
            payload = dict(point.payload or {})
            if not payload:
                continue
            key = _chunk_key(payload)
            chunk_by_key[key] = payload
            fused_scores[key] = fused_scores.get(key, 0.0) + 1.0 / (rrf_k + rank)

    # 2. BM25 keyword search (cached by file mtime)
    bm25_path = settings.bm25_dir / f"{repo_id}.json"
    if bm25_path.exists():
        mtime = bm25_path.stat().st_mtime
        cached = _BM25_CACHE.get(repo_id)
        if cached and cached[0] == mtime:
            records, bm25 = cached[1], cached[2]
        else:
            bm25_data = json.loads(bm25_path.read_text(encoding="utf-8"))
            records = bm25_data.get("records", [])
            tokenized = bm25_data.get("tokenized", [])
            bm25 = BM25Okapi(tokenized) if (records and tokenized) else None
            if bm25 is not None:
                _BM25_CACHE[repo_id] = (mtime, records, bm25)

        if records and bm25 is not None:
            query_tokens = _tokenize(query)
            scores = bm25.get_scores(query_tokens)
            ranked_indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[: top_k * 2]
            for rank, idx in enumerate(ranked_indices, start=1):
                if scores[idx] <= 0:
                    continue
                payload = records[idx]
                key = _chunk_key(payload)
                chunk_by_key[key] = payload
                fused_scores[key] = fused_scores.get(key, 0.0) + 1.0 / (rrf_k + rank)

    ranked_keys = sorted(fused_scores.keys(), key=lambda k: fused_scores[k], reverse=True)[:top_k]
    results: list[dict[str, Any]] = []
    for key in ranked_keys:
        item = dict(chunk_by_key[key])
        item["rrf_score"] = round(fused_scores[key], 6)
        results.append(item)
    return results

