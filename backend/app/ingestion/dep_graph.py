"""File dependency graph builder and persistence using NetworkX."""

import json
import re
from pathlib import Path
from typing import Any

import networkx as nx

from app.core.config import get_settings

PY_IMPORT_RE = re.compile(r"^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.,\s]+))", re.MULTILINE)
JS_IMPORT_RE = re.compile(
    r"""(?:import\s+.*?\s+from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\))"""
)
GO_IMPORT_RE = re.compile(r"""import\s+(?:\(\s*([^)]+)\s*\)|"([^"]+)")""", re.DOTALL)
JAVA_IMPORT_RE = re.compile(r"^\s*import\s+(?:static\s+)?([\w.]+);", re.MULTILINE)
CPP_INCLUDE_RE = re.compile(r'^\s*#include\s+"([^"]+)"', re.MULTILINE)

JS_EXTENSIONS = ("", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", "/index.jsx")


def _resolve_python_import(module_name: str, known_files: set[str], current_file: str) -> str | None:
    if module_name.startswith("."):
        dots = len(module_name) - len(module_name.lstrip("."))
        rel_mod = module_name.lstrip(".")
        base_parts = Path(current_file).parent.parts
        up = max(0, len(base_parts) - (dots - 1))
        prefix = "/".join(base_parts[:up])
        mod_path = rel_mod.replace(".", "/")
        candidate_base = f"{prefix}/{mod_path}".strip("/") if mod_path else prefix
        for suffix in (".py", "/__init__.py"):
            cand = f"{candidate_base}{suffix}"
            if cand in known_files:
                return cand
    else:
        mod_path = module_name.replace(".", "/")
        for suffix in (".py", "/__init__.py"):
            cand = f"{mod_path}{suffix}"
            if cand in known_files:
                return cand
            # Check under src/ or app/
            for alt_prefix in ("src/", "backend/", "app/"):
                alt = f"{alt_prefix}{cand}"
                if alt in known_files:
                    return alt
    return None


def _resolve_js_import(specifier: str, known_files: set[str], current_file: str) -> str | None:
    if not specifier.startswith("."):
        return None
    base_dir = Path(current_file).parent
    raw_target = (base_dir / specifier).as_posix()
    # Normalize '..' segments cleanly via PurePosixPath resolution
    parts: list[str] = []
    for part in raw_target.split("/"):
        if part in ("", "."):
            continue
        if part == "..":
            if parts:
                parts.pop()
        else:
            parts.append(part)
    norm_base = "/".join(parts)
    for ext in JS_EXTENSIONS:
        cand = f"{norm_base}{ext}"
        if cand in known_files:
            return cand
    return None


def _extract_raw_imports(content: str, language: str) -> list[str]:
    if language == "python":
        mods: list[str] = []
        for m in PY_IMPORT_RE.finditer(content):
            if m.group(1):
                mods.append(m.group(1).strip())
            elif m.group(2):
                for part in m.group(2).split(","):
                    name = part.strip().split(" as ")[0].strip()
                    if name:
                        mods.append(name)
        return mods

    if language in {"javascript", "typescript", "tsx"}:
        return [g for m in JS_IMPORT_RE.finditer(content) for g in m.groups() if g]

    if language == "go":
        refs: list[str] = []
        for m in GO_IMPORT_RE.finditer(content):
            block = m.group(1) or m.group(2) or ""
            for line in block.splitlines():
                quoted = re.search(r'"([^"]+)"', line)
                if quoted:
                    refs.append(quoted.group(1))
            if m.group(2):
                refs.append(m.group(2))
        return refs

    if language == "java":
        return [m.group(1) for m in JAVA_IMPORT_RE.finditer(content)]

    if language in {"cpp", "c"}:
        return [m.group(1) for m in CPP_INCLUDE_RE.finditer(content)]

    return []


def build_and_save_dep_graph(repo_id: str, files: list[dict[str, Any]]) -> dict[str, Any]:
    """Build a directed file-dependency graph and persist it to disk."""
    settings = get_settings()
    graph = nx.DiGraph()
    known_files = {f["path"] for f in files}

    for f in files:
        graph.add_node(
            f["path"],
            language=f["language"],
            line_count=f["line_count"],
            size=f["size"],
        )

    for f in files:
        src = f["path"]
        lang = f["language"]
        raw_imports = _extract_raw_imports(f["content"], lang)
        for imp in raw_imports:
            target: str | None = None
            if lang == "python":
                target = _resolve_python_import(imp, known_files, src)
            elif lang in {"javascript", "typescript", "tsx"}:
                target = _resolve_js_import(imp, known_files, src)
            elif lang in {"cpp", "c"}:
                rel = (Path(src).parent / imp).as_posix()
                if rel in known_files:
                    target = rel
            elif lang == "java":
                java_cand = imp.replace(".", "/") + ".java"
                for kf in known_files:
                    if kf.endswith(java_cand):
                        target = kf
                        break
            elif lang == "go":
                pkg_tail = imp.split("/")[-1]
                for kf in known_files:
                    if kf.endswith(".go") and Path(kf).parent.name == pkg_tail and kf != src:
                        target = kf
                        break

            if target and target != src:
                graph.add_edge(src, target, import_spec=imp)

    graph_path = settings.graphs_dir / f"{repo_id}.json"
    data = nx.node_link_data(graph)
    graph_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    return {
        "node_count": graph.number_of_nodes(),
        "edge_count": graph.number_of_edges(),
    }


def load_dep_graph(repo_id: str) -> nx.DiGraph:
    """Load persisted dependency graph for a repository."""
    settings = get_settings()
    graph_path = settings.graphs_dir / f"{repo_id}.json"
    if not graph_path.exists():
        return nx.DiGraph()
    data = json.loads(graph_path.read_text(encoding="utf-8"))
    return nx.node_link_graph(data)


def get_file_dependencies(repo_id: str, rel_path: str) -> dict[str, Any]:
    """Return outgoing imports and incoming dependents for a file."""
    graph = load_dep_graph(repo_id)
    if rel_path not in graph:
        return {"file": rel_path, "imports": [], "imported_by": []}
    return {
        "file": rel_path,
        "imports": sorted(graph.successors(rel_path)),
        "imported_by": sorted(graph.predecessors(rel_path)),
    }


def get_architecture_overview(repo_id: str, limit: int = 40) -> dict[str, Any]:
    """Return top central files, nodes, and edges for architecture visualization."""
    graph = load_dep_graph(repo_id)
    if graph.number_of_nodes() == 0:
        return {"nodes": [], "edges": [], "hub_files": [], "stats": {"files": 0, "edges": 0}}

    in_deg = dict(graph.in_degree())
    out_deg = dict(graph.out_degree())
    ranked = sorted(
        graph.nodes(),
        key=lambda n: (in_deg.get(n, 0) + out_deg.get(n, 0), in_deg.get(n, 0)),
        reverse=True,
    )[:limit]
    ranked_set = set(ranked)

    nodes = [
        {
            "id": n,
            "language": graph.nodes[n].get("language", "text"),
            "in_degree": in_deg.get(n, 0),
            "out_degree": out_deg.get(n, 0),
        }
        for n in ranked
    ]
    edges = [
        {"source": u, "target": v}
        for u, v in graph.edges()
        if u in ranked_set and v in ranked_set
    ]
    hub_files = [
        {"file": n, "imported_by": in_deg.get(n, 0), "imports": out_deg.get(n, 0)}
        for n in ranked[:10]
    ]
    return {
        "nodes": nodes,
        "edges": edges,
        "hub_files": hub_files,
        "stats": {"files": graph.number_of_nodes(), "edges": graph.number_of_edges()},
    }
