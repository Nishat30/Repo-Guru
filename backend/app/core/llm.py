"""Free-tier LLM wrapper powered by freelm (AsyncFreeLLM) + local embeddings."""

import hashlib
import logging
import math
import os
from collections.abc import AsyncIterator
from typing import Any

import freelm
from langchain_core.embeddings import Embeddings

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_client: freelm.AsyncFreeLLM | None = None

FRIENDLY_NO_PROVIDERS_MSG = (
    "No free-tier LLM providers are currently available. "
    "Please set at least one free API key in backend/.env "
    "(OPENROUTER_API_KEY, GEMINI_API_KEY, NVIDIA_API_KEY, GROQ_API_KEY, "
    "CEREBRAS_API_KEY, or MISTRAL_API_KEY) and try again."
)

FREE_ENV_KEYS = (
    "OPENROUTER_API_KEY",
    "GEMINI_API_KEY",
    "NVIDIA_API_KEY",
    "GROQ_API_KEY",
    "CEREBRAS_API_KEY",
    "MISTRAL_API_KEY",
    "ZAI_API_KEY",
    "COHERE_API_KEY",
    "CLOUDFLARE_API_TOKEN",
)


def get_freelm_client() -> freelm.AsyncFreeLLM | None:
    """Return a single shared AsyncFreeLLM client configured from environment variables."""
    global _client
    if _client is not None:
        return _client

    get_settings()
    try:
        _client = freelm.AsyncFreeLLM.from_env(strategy="quota_aware")
        return _client
    except freelm.ConfigError as exc:
        logger.warning("freelm not initialized (missing keys): %s", exc)
        return None


def has_llm_credentials() -> bool:
    """Return True if freelm has at least one configured provider or keyless mode enabled."""
    get_settings()
    if os.getenv("FREELM_KEYLESS", "").strip() == "1":
        return True
    return any(bool(os.getenv(k, "").strip()) for k in FREE_ENV_KEYS)


def health() -> list[dict[str, Any]]:
    """Return provider health metrics from freelm."""
    client = get_freelm_client()
    if client is None:
        return []
    return client.health()


def _build_messages(
    prompt: str | None = None,
    system_prompt: str | None = None,
    messages: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    if messages is not None:
        return messages
    built: list[dict[str, Any]] = []
    if system_prompt:
        built.append({"role": "system", "content": system_prompt})
    if prompt is not None:
        built.append({"role": "user", "content": prompt})
    return built


async def ask_response(
    prompt: str | None = None,
    *,
    model: str = "auto",
    system_prompt: str | None = None,
    messages: list[dict[str, Any]] | None = None,
    **kwargs: Any,
) -> freelm.ChatResponse:
    """Send an async chat request via freelm and return the full ChatResponse."""
    client = get_freelm_client()
    if client is None:
        raise RuntimeError(FRIENDLY_NO_PROVIDERS_MSG)

    payload = _build_messages(prompt=prompt, system_prompt=system_prompt, messages=messages)
    try:
        return await client.chat(payload, model=model, **kwargs)
    except freelm.NoProvidersAvailable as exc:
        logger.warning("freelm NoProvidersAvailable: %s", exc)
        raise RuntimeError(FRIENDLY_NO_PROVIDERS_MSG) from exc


async def ask(
    prompt: str,
    *,
    model: str = "auto",
    system_prompt: str | None = None,
    **kwargs: Any,
) -> str:
    """Send an async prompt via freelm and return the assistant text (or friendly error)."""
    try:
        resp = await ask_response(
            prompt=prompt,
            model=model,
            system_prompt=system_prompt,
            **kwargs,
        )
        if resp.choices and resp.choices[0].message.content:
            return str(resp.choices[0].message.content)
        return ""
    except freelm.NoProvidersAvailable:
        return FRIENDLY_NO_PROVIDERS_MSG
    except RuntimeError as exc:
        return str(exc)


async def stream(
    prompt: str | None = None,
    *,
    model: str = "auto",
    system_prompt: str | None = None,
    messages: list[dict[str, Any]] | None = None,
    **kwargs: Any,
) -> AsyncIterator[str]:
    """Stream response tokens asynchronously via freelm."""
    client = get_freelm_client()
    if client is None:
        yield FRIENDLY_NO_PROVIDERS_MSG
        return

    payload = _build_messages(prompt=prompt, system_prompt=system_prompt, messages=messages)
    try:
        async for chunk in client.astream(payload, model=model, **kwargs):
            if chunk:
                yield chunk
    except freelm.NoProvidersAvailable as exc:
        logger.warning("freelm stream NoProvidersAvailable: %s", exc)
        yield f"\n\n{FRIENDLY_NO_PROVIDERS_MSG}"


class LocalHashEmbeddings(Embeddings):
    """Deterministic zero-cost local embeddings for Hybrid RAG vector indexing."""

    def __init__(self, dim: int = 384) -> None:
        self.dim = dim

    def _embed(self, text: str) -> list[float]:
        vec = [0.0] * self.dim
        tokens = text.lower().split()
        if not tokens:
            return vec
        for token in tokens:
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            idx = int.from_bytes(digest[:4], "little") % self.dim
            sign = 1.0 if digest[4] % 2 == 0 else -1.0
            vec[idx] += sign
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._embed(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._embed(text)


def get_embeddings_model() -> tuple[Embeddings, int]:
    """Return zero-cost local embeddings implementation and vector dimension."""
    return LocalHashEmbeddings(dim=384), 384
