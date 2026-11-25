"""FastMCP stdio server for repository git commit history and summary statistics."""

import json
import logging
import os
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

from mcp.server.fastmcp import FastMCP

# Configure logging strictly to stderr to protect stdio JSON-RPC
logging.basicConfig(
    level=logging.INFO,
    stream=sys.stderr,
    format="%(asctime)s [git_mcp] %(levelname)s: %(message)s",
)
logger = logging.getLogger("git_mcp")

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import get_settings
from app.ingestion.cloner import IGNORED_DIRS, IGNORED_FILES, detect_language, is_binary_file

mcp = FastMCP("git_mcp")

REPO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def _resolve_workspace(repo_id: str) -> Path:
    if not REPO_ID_RE.match(repo_id):
        raise ValueError("Invalid repo_id format.")
    settings = get_settings()
    workspaces_root = settings.workspaces_dir.resolve()
    workspace = (workspaces_root / repo_id).resolve()
    if not workspace.is_relative_to(workspaces_root) or workspace == workspaces_root:
        raise PermissionError("Path traversal detected in repo_id.")
    if not workspace.exists():
        raise FileNotFoundError(f"Workspace for repo '{repo_id}' does not exist.")
    return workspace


def _resolve_repo_file(workspace: Path, file_path: str) -> Path:
    clean = file_path.strip().lstrip("/")
    target = (workspace / clean).resolve()
    if not target.is_relative_to(workspace):
        raise PermissionError(f"Path traversal blocked: '{file_path}' escapes workspace.")
    if not target.is_file():
        raise FileNotFoundError(f"File not found: '{file_path}'.")
    return target


@mcp.tool()
def get_file_commit_history(repo_id: str, file_path: str, limit: int = 10) -> str:
    """Return recent git commits touching a specific file (note: shallow clones may have 1 commit)."""
    workspace = _resolve_workspace(repo_id)
    target = _resolve_repo_file(workspace, file_path)
    rel = target.relative_to(workspace).as_posix()

    cmd = [
        "git",
        "-C",
        str(workspace),
        "log",
        f"-n{max(1, min(limit, 50))}",
        "--pretty=format:%h | %ad | %an | %s",
        "--date=short",
        "--",
        rel,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
    if proc.returncode != 0:
        return f"Git log error: {proc.stderr.strip()}"
    output = proc.stdout.strip()
    return output or f"No commit history available for {rel}."


@mcp.tool()
def get_repo_summary_stats(repo_id: str) -> str:
    """Return language breakdown, file counts, line counts, and latest commit info."""
    workspace = _resolve_workspace(repo_id)
    lang_files: Counter[str] = Counter()
    lang_lines: Counter[str] = Counter()
    total_files = 0
    total_lines = 0

    for root, dirs, files in os.walk(workspace):
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS and not d.startswith(".")]
        for fname in files:
            if fname in IGNORED_FILES:
                continue
            fp = Path(root) / fname
            if fp.is_symlink() or is_binary_file(fp):
                continue
            try:
                text = fp.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            lang = detect_language(fp)
            lc = len(text.splitlines())
            lang_files[lang] += 1
            lang_lines[lang] += lc
            total_files += 1
            total_lines += lc

    head_proc = subprocess.run(
        ["git", "-C", str(workspace), "log", "-1", "--pretty=format:%h | %ad | %an | %s", "--date=short"],
        capture_output=True,
        text=True,
        timeout=10,
    )
    latest_commit = head_proc.stdout.strip() if head_proc.returncode == 0 else "unknown"

    summary = {
        "total_files": total_files,
        "total_lines": total_lines,
        "latest_commit": latest_commit,
        "languages": [
            {"language": lang, "files": count, "lines": lang_lines[lang]}
            for lang, count in lang_files.most_common(12)
        ],
    }
    return json.dumps(summary, indent=2)


if __name__ == "__main__":
    logger.info("Starting git_mcp stdio server")
    mcp.run(transport="stdio")
