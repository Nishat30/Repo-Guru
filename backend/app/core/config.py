"""Application configuration loaded from environment variables."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings for RepoGuru AI."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    llm_provider: Literal["openai", "anthropic", "groq"] = "openai"
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"

    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_embedding_model: str = "text-embedding-3-small"

    anthropic_api_key: str = ""
    anthropic_model: str = "claude-3-5-sonnet-latest"

    data_dir: str = "./data"
    qdrant_url: str = ""
    database_url: str = "sqlite+aiosqlite:///./data/repoguru.db"

    clone_timeout_seconds: int = 90
    max_repo_size_mb: int = 250
    max_file_count: int = 2500

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def data_path(self) -> Path:
        return Path(self.data_dir).resolve()

    @property
    def workspaces_dir(self) -> Path:
        return self.data_path / "workspaces"

    @property
    def qdrant_dir(self) -> Path:
        return self.data_path / "qdrant_storage"

    @property
    def graphs_dir(self) -> Path:
        return self.data_path / "graphs"

    @property
    def bm25_dir(self) -> Path:
        return self.data_path / "bm25"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    def ensure_dirs(self) -> None:
        """Create required local storage directories."""
        for directory in (
            self.data_path,
            self.workspaces_dir,
            self.qdrant_dir,
            self.graphs_dir,
            self.bm25_dir,
        ):
            directory.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached settings instance."""
    settings = Settings()
    settings.ensure_dirs()
    return settings

