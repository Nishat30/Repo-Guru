"""Safe shallow GitHub repository cloner, ignore filter, and file tree builder."""

import hashlib
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

GITHUB_URL_PATTERN = re.compile(
    r"^https://github\.com/(?P<owner>[A-Za-z0-9_.-]+)/(?P<repo>[A-Za-z0-9_.-]+?)(?:\.git)?/?$"
)

IGNORED_DIRS = {
    ".git",
    "node_modules",
    "vendor",
    "__pycache__",
    ".venv",
    "venv",
    "env",
    "dist",
    "build",
    ".next",
    ".nuxt",
    ".vite",
    "target",
    "out",
    ".idea",
    ".vscode",
    "coverage",
    ".pytest_cache",
    ".mypy_cache",
}

IGNORED_FILES = {
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "poetry.lock",
    "Cargo.lock",
    "go.sum",
    "composer.lock",
    "Gemfile.lock",
    ".DS_Store",
    "Thumbs.db",
}

BINARY_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg", ".bmp",
    ".pdf", ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar",
    ".exe", ".dll", ".so", ".dylib", ".bin", ".o", ".a", ".pyc", ".pyo",
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
    ".mp3", ".mp4", ".wav", ".avi", ".mov", ".webm",
    ".db", ".sqlite", ".sqlite3", ".parquet", ".pkl", ".pickle",
}

LANGUAGE_MAP = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".ts": "typescript",
    ".tsx": "tsx",
    ".go": "go",
    ".java": "java",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".cxx": "cpp",
    ".hpp": "cpp",
    ".h": "cpp",
    ".c": "c",
    ".rs": "rust",
    ".rb": "ruby",
    ".php": "php",
    ".cs": "csharp",
    ".swift": "swift",
    ".kt": "kotlin",
    ".md": "markdown",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".sql": "sql",
    ".sh": "bash",
    ".css": "css",
    ".html": "html",
}

MAX_SINGLE_FILE_BYTES = 512 * 1024  # 512 KB


def parse_github_url(url: str) -> tuple[str, str]:
    """Validate and extract (owner, repo) from a public GitHub HTTPS URL."""
    cleaned = url.strip()
    match = GITHUB_URL_PATTERN.match(cleaned)
    if not match:
        raise ValueError(
            "Invalid GitHub URL. Only public https://github.com/<owner>/<repo> URLs are allowed."
        )
    owner = match.group("owner")
    repo = match.group("repo")
    if ".." in owner or ".." in repo:
        raise ValueError("Invalid repository path.")
    return owner, repo


def detect_language(path: Path) -> str:
    """Detect programming language from file extension."""
    return LANGUAGE_MAP.get(path.suffix.lower(), "text")


def is_binary_file(path: Path) -> bool:
    """Return True if the file is binary by extension or null-byte sniff."""
    if path.suffix.lower() in BINARY_EXTENSIONS:
        return True
    try:
        with path.open("rb") as f:
            chunk = f.read(2048)
        return b"\x00" in chunk
    except OSError:
        return True


def compute_sha256(path: Path) -> str:
    """Compute SHA-256 hex digest of a file."""
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(65536), b""):
            digest.update(block)
    return digest.hexdigest()


def safe_shallow_clone(
    url: str,
    target_dir: Path,
    timeout_seconds: int = 90,
    max_size_mb: int = 250,
    max_file_count: int = 2500,
) -> str | None:
    """Shallow-clone a GitHub repo safely without executing hooks, returning HEAD SHA."""
    owner, repo = parse_github_url(url)
    canonical_url = f"https://github.com/{owner}/{repo}.git"

    if target_dir.exists():
        shutil.rmtree(target_dir, ignore_errors=True)
    target_dir.parent.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    env["GIT_LFS_SKIP_SMUDGE"] = "1"

    cmd = [
        "git",
        "clone",
        "--depth",
        "1",
        "--single-branch",
        "--no-tags",
        "--config",
        f"core.hooksPath={os.devnull}",
        "--config",
        "core.symlinks=false",
        canonical_url,
        str(target_dir),
    ]

    try:
        subprocess.run(
            cmd,
            check=True,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            env=env,
        )
    except subprocess.TimeoutExpired as exc:
        shutil.rmtree(target_dir, ignore_errors=True)
        raise RuntimeError(f"Repository clone timed out after {timeout_seconds}s.") from exc
    except subprocess.CalledProcessError as exc:
        shutil.rmtree(target_dir, ignore_errors=True)
        stderr = (exc.stderr or "").strip()
        raise RuntimeError(f"Failed to clone repository: {stderr or 'git clone error'}") from exc

    # Enforce size and file count limits
    total_bytes = 0
    file_count = 0
    max_bytes = max_size_mb * 1024 * 1024

    for root, dirs, files in os.walk(target_dir):
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS]
        for filename in files:
            if filename in IGNORED_FILES:
                continue
            file_count += 1
            if file_count > max_file_count:
                shutil.rmtree(target_dir, ignore_errors=True)
                raise RuntimeError(
                    f"Repository exceeds maximum allowed file count ({max_file_count})."
                )
            fp = Path(root) / filename
            try:
                total_bytes += fp.stat().st_size
            except OSError:
                continue
            if total_bytes > max_bytes:
                shutil.rmtree(target_dir, ignore_errors=True)
                raise RuntimeError(
                    f"Repository exceeds maximum allowed size ({max_size_mb} MB)."
                )

    # Read HEAD commit SHA
    try:
        sha_proc = subprocess.run(
            ["git", "-C", str(target_dir), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
            timeout=10,
        )
        return sha_proc.stdout.strip()
    except Exception:
        return None


def collect_source_files(root_dir: Path, max_files: int = 2500) -> list[dict[str, Any]]:
    """Collect indexable text/source files with metadata."""
    collected: list[dict[str, Any]] = []
    root_resolved = root_dir.resolve()

    for current_root, dirs, files in os.walk(root_resolved):
        dirs[:] = sorted(d for d in dirs if d not in IGNORED_DIRS and not d.startswith("."))
        for filename in sorted(files):
            if filename in IGNORED_FILES:
                continue
            fp = Path(current_root) / filename
            if fp.is_symlink():
                continue
            try:
                size = fp.stat().st_size
            except OSError:
                continue
            if size == 0 or size > MAX_SINGLE_FILE_BYTES or is_binary_file(fp):
                continue

            rel_path = fp.relative_to(root_resolved).as_posix()
            try:
                text = fp.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue

            collected.append(
                {
                    "path": rel_path,
                    "abs_path": fp,
                    "language": detect_language(fp),
                    "size": size,
                    "line_count": len(text.splitlines()),
                    "sha256": compute_sha256(fp),
                    "content": text,
                }
            )
            if len(collected) >= max_files:
                return collected

    return collected


def build_file_tree(root_dir: Path) -> list[dict[str, Any]]:
    """Build a nested VS Code-style file tree excluding ignored directories and binaries."""
    root_resolved = root_dir.resolve()

    def _walk(directory: Path) -> list[dict[str, Any]]:
        entries: list[dict[str, Any]] = []
        try:
            children = sorted(
                directory.iterdir(),
                key=lambda p: (not p.is_dir(), p.name.lower()),
            )
        except OSError:
            return entries

        for item in children:
            if item.is_symlink():
                continue
            name = item.name
            if item.is_dir():
                if name in IGNORED_DIRS or (name.startswith(".") and name not in {".github"}):
                    continue
                sub_children = _walk(item)
                if sub_children:
                    entries.append(
                        {
                            "name": name,
                            "path": item.relative_to(root_resolved).as_posix(),
                            "type": "dir",
                            "children": sub_children,
                        }
                    )
            else:
                if name in IGNORED_FILES or is_binary_file(item):
                    continue
                try:
                    size = item.stat().st_size
                except OSError:
                    continue
                entries.append(
                    {
                        "name": name,
                        "path": item.relative_to(root_resolved).as_posix(),
                        "type": "file",
                        "size": size,
                        "language": detect_language(item),
                    }
                )
        return entries

    return _walk(root_resolved)
