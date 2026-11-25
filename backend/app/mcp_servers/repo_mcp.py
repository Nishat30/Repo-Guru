"""FastMCP stdio server for safe repository file tree, line reading, symbol search, and dependencies."""

import json
import logging
import os
import re
import sys
from pathlib import Path

from mcp.server.fastmcp import FastMCP

# Configure logging strictly to stderr to protect stdio JSON-RPC
logging.basicConfig(
    level=logging.INFO,
    stream=sys.stderr,
    format="%(asctime)s [repo_mcp] %(levelname)s: %(message)s",
)
logger = logging.getLogger("repo_mcp")

# Ensure backend/ is importable when launched as a subprocess
BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import get_settings
from app.ingestion.cloner import IGNORED_DIRS, IGNORED_FILES, is_binary_file
from app.ingestion.dep_graph import get_file_dependencies as _get_file_dependencies

mcp = FastMCP("repo_mcp")

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
def get_repo_tree(repo_id: str, max_depth: int = 4) -> str:
    """Return an indented directory and file tree for the repository."""
    workspace = _resolve_workspace(repo_id)
    lines: list[str] = []

    def _walk(directory: Path, depth: int) -> None:
        if depth > max_depth:
            return
        try:
            entries = sorted(directory.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
        except OSError:
            return
        for entry in entries:
            if entry.is_symlink():
                continue
            if entry.is_dir():
                if entry.name in IGNORED_DIRS or (entry.name.startswith(".") and entry.name != ".github"):
                    continue
                lines.append(f"{'  ' * depth}{entry.name}/")
                _walk(entry, depth + 1)
            else:
                if entry.name in IGNORED_FILES or is_binary_file(entry):
                    continue
                lines.append(f"{'  ' * depth}{entry.name}")

    _walk(workspace, 0)
    return "\n".join(lines[:400]) if lines else "(empty repository)"


@mcp.tool()
def read_file_lines(repo_id: str, file_path: str, start_line: int = 1, end_line: int = 120) -> str:
    """Read 1-indexed line range from a repository file with line numbers."""
    workspace = _resolve_workspace(repo_id)
    target = _resolve_repo_file(workspace, file_path)
    if is_binary_file(target):
        raise ValueError(f"Cannot read binary file: {file_path}")

    text = target.read_text(encoding="utf-8", errors="replace")
    all_lines = text.splitlines()
    total = len(all_lines)
    start = max(1, start_line)
    end = min(total, max(start, end_line))
    if start > total:
        return f"File '{file_path}' only has {total} lines (requested {start_line}-{end_line})."

    numbered = [f"{idx}: {all_lines[idx - 1]}" for idx in range(start, end + 1)]
    rel = target.relative_to(workspace).as_posix()
    return f"File: {rel} (lines {start}-{end} of {total})\n" + "\n".join(numbered)


@mcp.tool()
def search_symbol(repo_id: str, symbol: str, max_results: int = 20) -> str:
    """Search for exact or case-insensitive occurrences of a symbol across repository files."""
    workspace = _resolve_workspace(repo_id)
    query = symbol.strip()
    if not query:
        return "Empty symbol query."

    pattern = re.compile(re.escape(query), re.IGNORECASE)
    matches: list[str] = []

    for root, dirs, files in os.walk(workspace):
        dirs[:] = sorted(d for d in dirs if d not in IGNORED_DIRS and not d.startswith("."))
        for fname in sorted(files):
            if fname in IGNORED_FILES:
                continue
            fp = Path(root) / fname
            if fp.is_symlink() or is_binary_file(fp):
                continue
            try:
                content = fp.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            rel = fp.relative_to(workspace).as_posix()
            for idx, line in enumerate(content.splitlines(), start=1):
                if pattern.search(line):
                    matches.append(f"{rel}:{idx}: {line.strip()[:160]}")
                    if len(matches) >= max_results:
                        return "\n".join(matches)

    return "\n".join(matches) if matches else f"No occurrences found for '{symbol}'."


@mcp.tool()
def get_file_dependencies(repo_id: str, file_path: str) -> str:
    """Return outgoing imports and incoming dependents for a file in the dependency graph."""
    workspace = _resolve_workspace(repo_id)
    target = _resolve_repo_file(workspace, file_path)
    rel = target.relative_to(workspace).as_posix()
    deps = _get_file_dependencies(repo_id, rel)
    return json.dumps(deps, indent=2)


if __name__ == "__main__":
    logger.info("Starting repo_mcp stdio server")
    mcp.run(transport="stdio")
