"""Tree-sitter AST chunker with exact 1-indexed line ranges and line-window fallback."""

from dataclasses import dataclass
from typing import Any

from tree_sitter_language_pack import get_parser

SUPPORTED_AST_LANGUAGES = {"python", "javascript", "typescript", "tsx", "go", "java", "cpp"}

TARGET_NODE_TYPES: dict[str, set[str]] = {
    "python": {"function_definition", "async_function_definition", "class_definition"},
    "javascript": {
        "function_declaration",
        "class_declaration",
        "method_definition",
        "arrow_function",
        "export_statement",
    },
    "typescript": {
        "function_declaration",
        "class_declaration",
        "method_definition",
        "interface_declaration",
        "type_alias_declaration",
        "export_statement",
    },
    "tsx": {
        "function_declaration",
        "class_declaration",
        "method_definition",
        "interface_declaration",
        "type_alias_declaration",
        "export_statement",
    },
    "go": {"function_declaration", "method_declaration", "type_declaration"},
    "java": {"class_declaration", "interface_declaration", "method_declaration", "constructor_declaration"},
    "cpp": {"function_definition", "class_specifier", "struct_specifier", "namespace_definition"},
}

MAX_AST_CHUNK_LINES = 140
WINDOW_LINES = 60
WINDOW_OVERLAP = 15


@dataclass
class CodeChunk:
    """A semantically intact code chunk with exact 1-indexed line coordinates."""

    file_path: str
    start_line: int
    end_line: int
    language: str
    symbol_name: str
    node_type: str
    content: str
    file_sha256: str


def _extract_symbol_name(node: Any, source_bytes: bytes) -> str:
    """Extract identifier/name child from an AST node if present."""
    for child in node.children:
        if child.type in {
            "identifier",
            "type_identifier",
            "property_identifier",
            "field_identifier",
            "name",
        }:
            return source_bytes[child.start_byte : child.end_byte].decode("utf-8", errors="replace")
        # Handle Go type_spec or C++ function_declarator
        if child.type in {"type_spec", "function_declarator"}:
            nested = _extract_symbol_name(child, source_bytes)
            if nested != "anonymous":
                return nested
    return "anonymous"


def _window_chunks(
    file_path: str,
    lines: list[str],
    language: str,
    file_sha256: str,
    start_offset: int = 1,
    symbol_prefix: str = "window",
    node_type: str = "line_window",
) -> list[CodeChunk]:
    """Split lines into overlapping fixed-size windows with exact 1-indexed lines."""
    chunks: list[CodeChunk] = []
    total = len(lines)
    if total == 0:
        return chunks

    idx = 0
    while idx < total:
        end_idx = min(idx + WINDOW_LINES, total)
        slice_lines = lines[idx:end_idx]
        s_line = start_offset + idx
        e_line = start_offset + end_idx - 1
        chunks.append(
            CodeChunk(
                file_path=file_path,
                start_line=s_line,
                end_line=e_line,
                language=language,
                symbol_name=f"{symbol_prefix}:{s_line}-{e_line}",
                node_type=node_type,
                content="\n".join(slice_lines),
                file_sha256=file_sha256,
            )
        )
        if end_idx >= total:
            break
        idx += WINDOW_LINES - WINDOW_OVERLAP

    return chunks


def chunk_file(
    file_path: str,
    content: str,
    language: str,
    file_sha256: str,
) -> list[CodeChunk]:
    """Parse a source file with Tree-sitter ASTs and fall back to line windows."""
    lines = content.splitlines()
    if not lines:
        return []

    if language not in SUPPORTED_AST_LANGUAGES:
        return _window_chunks(file_path, lines, language, file_sha256)

    try:
        parser = get_parser(language)
        source_bytes = content.encode("utf-8", errors="replace")
        tree = parser.parse(source_bytes)
    except Exception:
        return _window_chunks(file_path, lines, language, file_sha256)

    target_types = TARGET_NODE_TYPES.get(language, set())
    chunks: list[CodeChunk] = []
    seen_ranges: set[tuple[int, int]] = set()

    def _visit(node: Any) -> None:
        if node.type in target_types:
            start_line = node.start_point[0] + 1
            end_line = node.end_point[0] + 1
            if (start_line, end_line) not in seen_ranges and end_line >= start_line:
                seen_ranges.add((start_line, end_line))
                symbol = _extract_symbol_name(node, source_bytes)
                node_lines = lines[start_line - 1 : end_line]
                if len(node_lines) > MAX_AST_CHUNK_LINES:
                    chunks.extend(
                        _window_chunks(
                            file_path=file_path,
                            lines=node_lines,
                            language=language,
                            file_sha256=file_sha256,
                            start_offset=start_line,
                            symbol_prefix=symbol,
                            node_type=node.type,
                        )
                    )
                else:
                    chunks.append(
                        CodeChunk(
                            file_path=file_path,
                            start_line=start_line,
                            end_line=end_line,
                            language=language,
                            symbol_name=symbol,
                            node_type=node.type,
                            content="\n".join(node_lines),
                            file_sha256=file_sha256,
                        )
                    )
            # Still descend into classes/namespaces to capture individual methods
            if node.type in {"class_definition", "class_declaration", "class_specifier", "namespace_definition"}:
                for child in node.children:
                    _visit(child)
            return

        for child in node.children:
            _visit(child)

    _visit(tree.root_node)

    if not chunks:
        return _window_chunks(file_path, lines, language, file_sha256)

    return chunks
