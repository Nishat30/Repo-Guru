"""LangGraph multi-agent workflow with parallel RAG + MCP exploration and citation verification."""

import json
import logging
import re
import sys
from pathlib import Path
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.graph import END, START, StateGraph

from app.agents.prompts import (
    ENGLISH_INSTRUCTIONS,
    HINGLISH_INSTRUCTIONS,
    MCP_EXPLORER_PROMPT,
    ROUTER_PROMPT,
    SENIOR_MENTOR_PROMPT,
)
from app.agents.state import AgentState
from app.core.config import get_settings
from app.core.llm import get_chat_model
from app.ingestion.indexer import hybrid_search

logger = logging.getLogger(__name__)

CITATION_RE = re.compile(r"\[\[citation:([^:\]\s]+):(\d+)-(\d+)\]\]")
BACKEND_ROOT = Path(__file__).resolve().parents[2]


def _get_mcp_server_config() -> dict[str, dict[str, Any]]:
    repo_mcp_path = str((BACKEND_ROOT / "app" / "mcp_servers" / "repo_mcp.py").resolve())
    git_mcp_path = str((BACKEND_ROOT / "app" / "mcp_servers" / "git_mcp.py").resolve())
    return {
        "repo_mcp": {
            "command": sys.executable,
            "args": [repo_mcp_path],
            "transport": "stdio",
        },
        "git_mcp": {
            "command": sys.executable,
            "args": [git_mcp_path],
            "transport": "stdio",
        },
    }


def validate_citations_against_workspace(
    repo_id: str,
    citations: list[tuple[str, int, int]],
) -> tuple[list[dict[str, Any]], list[str]]:
    """Verify every cited file exists in workspace and line ranges are within file bounds."""
    settings = get_settings()
    workspace = (settings.workspaces_dir / repo_id).resolve()
    verified: list[dict[str, Any]] = []
    invalid: list[str] = []
    seen: set[tuple[str, int, int]] = set()

    for rel_path, start_line, end_line in citations:
        if (rel_path, start_line, end_line) in seen:
            continue
        seen.add((rel_path, start_line, end_line))

        clean_rel = rel_path.strip().lstrip("/")
        target = (workspace / clean_rel).resolve()
        if not target.is_relative_to(workspace) or not target.is_file():
            invalid.append(f"{rel_path}:{start_line}-{end_line} (file not found)")
            continue
        try:
            total_lines = len(target.read_text(encoding="utf-8", errors="replace").splitlines())
        except OSError:
            invalid.append(f"{rel_path}:{start_line}-{end_line} (unreadable)")
            continue

        if start_line < 1 or end_line < start_line or end_line > total_lines:
            invalid.append(
                f"{rel_path}:{start_line}-{end_line} (invalid range, file has {total_lines} lines)"
            )
            continue

        verified.append(
            {
                "file": clean_rel,
                "start_line": start_line,
                "end_line": end_line,
            }
        )

    return verified, invalid


def extract_citations_from_text(text: str) -> list[dict[str, Any]]:
    """Parse [[citation:file:start-end]] tags from text."""
    seen: set[tuple[str, int, int]] = set()
    results: list[dict[str, Any]] = []
    for match in CITATION_RE.finditer(text):
        rel = match.group(1).strip()
        s = int(match.group(2))
        e = int(match.group(3))
        if (rel, s, e) not in seen:
            seen.add((rel, s, e))
            results.append({"file": rel, "start_line": s, "end_line": e})
    return results


async def router_node(state: AgentState) -> dict[str, Any]:
    """Classify user query intent and formulate search query."""
    question = state["question"]
    route = "general"
    search_query = question

    try:
        llm = get_chat_model(temperature=0.0)
        resp = await llm.ainvoke(
            [
                SystemMessage(content=ROUTER_PROMPT),
                HumanMessage(content=question),
            ]
        )
        raw = str(resp.content).strip()
        json_match = re.search(r"\{.*\}", raw, re.DOTALL)
        if json_match:
            parsed = json.loads(json_match.group(0))
            route = parsed.get("route", "general")
            search_query = parsed.get("search_query", question)
    except Exception as exc:
        logger.warning("Router fallback due to: %s", exc)

    return {
        "route": route,
        "search_query": search_query,
        "retry_count": state.get("retry_count", 0),
        "status_events": ["Routing"],
    }


async def hybrid_rag_node(state: AgentState) -> dict[str, Any]:
    """Execute Hybrid RAG (Qdrant vector + BM25 + RRF) retrieval."""
    repo_id = state["repo_id"]
    query = state.get("search_query") or state["question"]
    results = hybrid_search(repo_id=repo_id, query=query, top_k=8)
    return {
        "rag_results": results,
        "status_events": ["Searching"],
    }


async def mcp_explorer_node(state: AgentState) -> dict[str, Any]:
    """Explore repository using repo_mcp and git_mcp stdio tools."""
    repo_id = state["repo_id"]
    question = state["question"]
    feedback = state.get("verification_feedback", "")
    feedback_block = (
        f"PREVIOUS VERIFICATION FEEDBACK (fix these issues):\n{feedback}"
        if feedback
        else ""
    )

    findings_parts: list[str] = []
    try:
        client = MultiServerMCPClient(_get_mcp_server_config())
        tools = await client.get_tools()
        for tool in tools:
            if hasattr(tool, "handle_tool_error"):
                tool.handle_tool_error = True

        tool_map = {t.name: t for t in tools}
        llm = get_chat_model(temperature=0.1).bind_tools(tools)

        messages: list[Any] = [
            SystemMessage(
                content=MCP_EXPLORER_PROMPT.format(
                    repo_id=repo_id,
                    feedback_block=feedback_block,
                )
            ),
            HumanMessage(content=f"Repository ID: {repo_id}\nQuestion: {question}"),
        ]

        # Up to 4 tool-calling turns
        for _ in range(4):
            ai_msg = await llm.ainvoke(messages)
            messages.append(ai_msg)
            tool_calls = getattr(ai_msg, "tool_calls", None) or []
            if not tool_calls:
                if ai_msg.content:
                    findings_parts.append(str(ai_msg.content))
                break

            for tc in tool_calls:
                t_name = tc.get("name", "")
                t_args = dict(tc.get("args", {}))
                t_args.setdefault("repo_id", repo_id)
                tool_obj = tool_map.get(t_name)
                if not tool_obj:
                    tool_output = f"Tool '{t_name}' not found."
                else:
                    try:
                        tool_output = await tool_obj.ainvoke(t_args)
                    except Exception as tool_exc:
                        tool_output = f"Tool error ({t_name}): {tool_exc}"
                messages.append(
                    ToolMessage(
                        content=str(tool_output)[:6000],
                        tool_call_id=tc.get("id", t_name),
                    )
                )
        else:
            # Summarize after max tool rounds
            final_msg = await llm.ainvoke(messages)
            if final_msg.content:
                findings_parts.append(str(final_msg.content))

    except Exception as exc:
        logger.warning("MCP explorer error: %s", exc)
        findings_parts.append(f"MCP exploration encountered an error: {exc}")

    return {
        "mcp_findings": "\n\n".join(findings_parts),
        "status_events": ["Exploring"],
    }


async def citation_verifier_node(state: AgentState) -> dict[str, Any]:
    """Verify all cited file paths and line ranges against the cloned workspace."""
    repo_id = state["repo_id"]
    rag_results = state.get("rag_results", [])
    mcp_findings = state.get("mcp_findings", "")
    retry_count = state.get("retry_count", 0)

    candidate_tuples: list[tuple[str, int, int]] = []
    for item in rag_results:
        candidate_tuples.append(
            (item["file_path"], int(item["start_line"]), int(item["end_line"]))
        )
    for match in CITATION_RE.finditer(mcp_findings):
        candidate_tuples.append(
            (match.group(1).strip(), int(match.group(2)), int(match.group(3)))
        )

    verified, invalid = validate_citations_against_workspace(repo_id, candidate_tuples)

    feedback = ""
    if invalid and retry_count < 2:
        feedback = (
            "Some cited file paths or line ranges were invalid:\n- "
            + "\n- ".join(invalid)
            + "\nUse `get_repo_tree` and `read_file_lines` to obtain exact valid paths and line numbers."
        )
        return {
            "verified_citations": verified,
            "invalid_citations": invalid,
            "verification_feedback": feedback,
            "retry_count": retry_count + 1,
            "status_events": ["Verifying"],
        }

    return {
        "verified_citations": verified,
        "invalid_citations": invalid,
        "verification_feedback": "",
        "status_events": ["Verifying"],
    }


def _should_retry_exploration(state: AgentState) -> str:
    """Route back to mcp_explorer if invalid citations were found and retries remain."""
    if state.get("verification_feedback") and state.get("retry_count", 0) <= 2:
        return "mcp_explorer"
    return "senior_mentor"


def build_mentor_messages(state: AgentState) -> list[Any]:
    """Construct messages for the Senior Mentor node from verified evidence."""
    repo_id = state["repo_id"]
    language_mode = state.get("language_mode", "english")
    lang_instructions = (
        HINGLISH_INSTRUCTIONS if language_mode == "hinglish" else ENGLISH_INSTRUCTIONS
    )

    rag_blocks: list[str] = []
    for item in state.get("rag_results", [])[:8]:
        rag_blocks.append(
            f"### [[citation:{item['file_path']}:{item['start_line']}-{item['end_line']}]] "
            f"({item.get('symbol_name', '')})\n```{item.get('language', '')}\n{item['content']}\n```"
        )

    evidence = (
        "## Verified Hybrid RAG Code Chunks\n"
        + ("\n\n".join(rag_blocks) if rag_blocks else "(No RAG chunks retrieved)")
        + "\n\n## Verified MCP Explorer Findings\n"
        + (state.get("mcp_findings") or "(No additional MCP findings)")
    )

    history_text = ""
    history = state.get("chat_history") or []
    if history:
        recent = history[-6:]
        history_text = "\n".join(f"{m.get('role', 'user').upper()}: {m.get('content', '')}" for m in recent)
        history_text = f"## Recent Conversation\n{history_text}\n\n"

    system_prompt = SENIOR_MENTOR_PROMPT.format(
        repo_id=repo_id,
        language_mode=language_mode,
        language_instructions=lang_instructions,
    )

    return [
        SystemMessage(content=system_prompt),
        HumanMessage(content=f"{history_text}{evidence}\n\n## User Question\n{state['question']}"),
    ]


async def senior_mentor_node(state: AgentState) -> dict[str, Any]:
    """Generate final grounded response in English or Hinglish."""
    llm = get_chat_model(temperature=0.2, streaming=True)
    messages = build_mentor_messages(state)
    response = await llm.ainvoke(messages)
    answer = str(response.content)

    # Filter cited tags against workspace to guarantee 100% valid citations
    raw_cites = [
        (c["file"], c["start_line"], c["end_line"])
        for c in extract_citations_from_text(answer)
    ]
    verified, _ = validate_citations_against_workspace(state["repo_id"], raw_cites)

    return {
        "final_answer": answer,
        "verified_citations": verified,
        "status_events": ["Writing"],
    }


def build_repoguru_graph():
    """Compile the RepoGuru LangGraph StateGraph."""
    builder = StateGraph(AgentState)

    builder.add_node("router", router_node)
    builder.add_node("hybrid_rag", hybrid_rag_node)
    builder.add_node("mcp_explorer", mcp_explorer_node)
    builder.add_node("citation_verifier", citation_verifier_node)
    builder.add_node("senior_mentor", senior_mentor_node)

    builder.add_edge(START, "router")
    # Parallel fan-out from router to hybrid_rag and mcp_explorer
    builder.add_edge("router", "hybrid_rag")
    builder.add_edge("router", "mcp_explorer")
    # Join at citation_verifier
    builder.add_edge("hybrid_rag", "citation_verifier")
    builder.add_edge("mcp_explorer", "citation_verifier")

    builder.add_conditional_edges(
        "citation_verifier",
        _should_retry_exploration,
        {
            "mcp_explorer": "mcp_explorer",
            "senior_mentor": "senior_mentor",
        },
    )
    builder.add_edge("senior_mentor", END)

    return builder.compile()


repoguru_graph = build_repoguru_graph()
