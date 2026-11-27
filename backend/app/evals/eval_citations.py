"""Automated evaluation script testing AST line-citation accuracy & Hybrid RAG retrieval recall."""

import json
import shutil
import sys
import tempfile
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.agents.graph import validate_citations_against_workspace
from app.core.config import get_settings
from app.ingestion.ast_chunker import chunk_file
from app.ingestion.cloner import compute_sha256, detect_language
from app.ingestion.dep_graph import build_and_save_dep_graph, get_file_dependencies
from app.ingestion.indexer import hybrid_search, index_chunks

SAMPLE_FILES = {
    "app/auth.py": '''def verify_token(token: str) -> bool:
    """Validate an incoming bearer token."""
    if not token or not token.startswith("rg_"):
        return False
    return len(token) > 10


class AuthService:
    """Handles user login and session verification."""

    def login(self, username: str, password: str) -> dict:
        if not username or not password:
            raise ValueError("Missing credentials")
        return {"user": username, "token": f"rg_{username}_session"}
''',
    "app/main.py": '''from app.auth import AuthService, verify_token


def handle_login_request(username: str, password: str) -> dict:
    service = AuthService()
    return service.login(username, password)


def health_check() -> dict:
    return {"status": "ok"}
''',
}

EVAL_CASES = [
    {
        "query": "How does login authentication work in AuthService?",
        "expected_file": "app/auth.py",
        "expected_symbol": "login",
    },
    {
        "query": "Where is handle_login_request defined?",
        "expected_file": "app/main.py",
        "expected_symbol": "handle_login_request",
    },
    {
        "query": "verify_token bearer token validation",
        "expected_file": "app/auth.py",
        "expected_symbol": "verify_token",
    },
]


def run_eval() -> int:
    settings = get_settings()
    eval_repo_id = "eval_sample_repo"
    workspace = (settings.workspaces_dir / eval_repo_id).resolve()

    if workspace.exists():
        shutil.rmtree(workspace, ignore_errors=True)
    workspace.mkdir(parents=True, exist_ok=True)

    try:
        # 1. Materialize sample repo
        files_meta = []
        all_chunks = []
        for rel_path, content in SAMPLE_FILES.items():
            fp = workspace / rel_path
            fp.parent.mkdir(parents=True, exist_ok=True)
            fp.write_text(content, encoding="utf-8")
            sha = compute_sha256(fp)
            lang = detect_language(fp)
            files_meta.append(
                {
                    "path": rel_path,
                    "abs_path": fp,
                    "language": lang,
                    "size": fp.stat().st_size,
                    "line_count": len(content.splitlines()),
                    "sha256": sha,
                    "content": content,
                }
            )
            chunks = chunk_file(rel_path, content, lang, sha)
            all_chunks.extend(chunks)

        # 2. Build dependency graph & index chunks
        graph_stats = build_and_save_dep_graph(eval_repo_id, files_meta)
        indexed = index_chunks(eval_repo_id, all_chunks)

        # 3. Verify AST chunk line accuracy
        ast_exact_hits = 0
        for c in all_chunks:
            file_lines = SAMPLE_FILES[c.file_path].splitlines()
            extracted = "\n".join(file_lines[c.start_line - 1 : c.end_line])
            if extracted.strip() == c.content.strip():
                ast_exact_hits += 1

        ast_accuracy = ast_exact_hits / max(1, len(all_chunks))

        # 4. Verify Hybrid RAG retrieval recall@5
        recall_hits = 0
        for case in EVAL_CASES:
            results = hybrid_search(eval_repo_id, case["query"], top_k=5)
            matched = any(
                r["file_path"] == case["expected_file"]
                and case["expected_symbol"] in (r.get("symbol_name", "") + r.get("content", ""))
                for r in results
            )
            if matched:
                recall_hits += 1
        recall_at_5 = recall_hits / len(EVAL_CASES)

        # 5. Verify Citation Verifier & Path Traversal rejection
        valid_cites = [(c.file_path, c.start_line, c.end_line) for c in all_chunks]
        bad_cites = [
            ("app/auth.py", 1, 9999),        # out-of-bounds line range
            ("../../etc/passwd", 1, 5),       # path traversal attempt
            ("nonexistent.py", 1, 10),        # missing file
        ]
        verified, invalid = validate_citations_against_workspace(
            eval_repo_id, valid_cites + bad_cites
        )
        verifier_precision_ok = len(verified) == len(valid_cites) and len(invalid) == len(bad_cites)

        # 6. Verify Dependency Graph edge resolution
        deps = get_file_dependencies(eval_repo_id, "app/main.py")
        dep_graph_ok = "app/auth.py" in deps["imports"]

        report = {
            "chunks_indexed": indexed,
            "graph_stats": graph_stats,
            "ast_line_accuracy": round(ast_accuracy, 3),
            "hybrid_rag_recall_at_5": round(recall_at_5, 3),
            "citation_verifier_ok": verifier_precision_ok,
            "dep_graph_ok": dep_graph_ok,
        }
        print(json.dumps(report, indent=2))

        if ast_accuracy < 1.0 or recall_at_5 < 1.0 or not verifier_precision_ok or not dep_graph_ok:
            print("EVAL FAILED", file=sys.stderr)
            return 1
        print("EVAL PASSED")
        return 0
    finally:
        shutil.rmtree(workspace, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(run_eval())

