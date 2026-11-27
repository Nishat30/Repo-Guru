"""LLM and embedding provider factory supporting OpenAI and Anthropic."""

import hashlib
import math
from typing import Sequence

from langchain_anthropic import ChatAnthropic
from langchain_core.embeddings import Embeddings
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI, OpenAIEmbeddings

from app.core.config import get_settings


class LocalHashEmbeddings(Embeddings):
    """Deterministic fallback embeddings when no OpenAI API key is configured."""

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


def get_chat_model(
    provider: str | None = None,
    temperature: float = 0.2,
    streaming: bool = False,
) -> BaseChatModel:
    """Instantiate configured chat model for OpenAI, Anthropic, or Groq."""
    settings = get_settings()
    chosen = (provider or settings.llm_provider).lower()

    if chosen == "groq":
        if not settings.groq_api_key:
            raise ValueError("GROQ_API_KEY is not configured.")
        return ChatGroq(
            model=settings.groq_model,
            api_key=settings.groq_api_key,
            temperature=temperature,
            streaming=streaming,
        )

    if chosen == "anthropic":
        if not settings.anthropic_api_key:
            raise ValueError("ANTHROPIC_API_KEY is not configured.")
        return ChatAnthropic(
            model=settings.anthropic_model,
            api_key=settings.anthropic_api_key,
            temperature=temperature,
            streaming=streaming,
        )

    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY is not configured.")
    return ChatOpenAI(
        model=settings.openai_model,
        api_key=settings.openai_api_key,
        temperature=temperature,
        streaming=streaming,
    )


def get_embeddings_model() -> tuple[Embeddings, int]:
    """Return embeddings implementation and vector dimension."""
    settings = get_settings()
    if settings.openai_api_key and not settings.openai_api_key.startswith("sk-your-"):
        dim = 1536 if "3-small" in settings.openai_embedding_model else 3072
        return (
            OpenAIEmbeddings(
                model=settings.openai_embedding_model,
                api_key=settings.openai_api_key,
            ),
            dim,
        )
    return LocalHashEmbeddings(dim=384), 384


def has_llm_credentials() -> bool:
    """Check whether at least one valid LLM API key is configured."""
    settings = get_settings()
    if settings.llm_provider == "groq":
        return bool(settings.groq_api_key and not settings.groq_api_key.startswith("gsk_your-"))
    if settings.llm_provider == "anthropic":
        return bool(settings.anthropic_api_key and not settings.anthropic_api_key.startswith("sk-ant-your-"))
    return bool(settings.openai_api_key and not settings.openai_api_key.startswith("sk-your-"))

