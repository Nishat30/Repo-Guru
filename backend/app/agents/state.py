"""LangGraph shared state definition for the RepoGuru multi-agent system."""

import operator
from typing import Annotated, Any, Literal, TypedDict


class AgentState(TypedDict, total=False):
    """State passed across router, parallel retrieval/MCP, verifier, and mentor nodes."""

    repo_id: str
    question: str
    language_mode: Literal["english", "hinglish"]
    chat_history: list[dict[str, str]]

    route: str
    search_query: str

    rag_results: list[dict[str, Any]]
    mcp_findings: str

    verified_citations: list[dict[str, Any]]
    invalid_citations: list[str]
    verification_feedback: str
    retry_count: int

    final_answer: str
    status_events: Annotated[list[str], operator.add]
