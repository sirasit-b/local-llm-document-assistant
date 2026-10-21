"""Environment-driven application configuration.

Every value is validated at import time so a misconfigured container fails
fast instead of failing later with a confusing runtime error.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    app_env: Literal["development", "staging", "production"] = "development"
    log_level: str = "INFO"

    database_url: str = "postgresql+psycopg://docassist:docassist@postgres:5432/docassist"

    # Storage
    storage_dir: str = "/data/documents"
    max_upload_mb: int = 50

    # LLM / embedding defaults. Empty means "not configured".
    default_llm_provider: Literal["local", "openai"] = "openai"
    default_llm_model: str = "gpt-4o-mini"
    default_embedding_provider: Literal["local", "openai"] = "openai"
    default_embedding_model: str = "text-embedding-3-small"

    # Local AI
    local_provider_type: Literal["ollama", "vllm", "openai_compatible"] = "ollama"
    ollama_base_url: str = "http://ollama:11434"
    vllm_base_url: str = ""
    local_api_key: str = ""

    # OpenAI
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"

    # OCR
    ocr_provider: Literal["tesseract", "none"] = "none"
    ocr_base_url: str = ""

    # Privacy policy switch, enforced server-side.
    local_only_mode: bool = False

    # Retrieval
    chunk_size: int = 1200
    chunk_overlap: int = 180
    retrieval_top_k: int = 6
    min_relevance_score: float = Field(default=0.18, ge=0.0, le=1.0)

    request_timeout_seconds: int = 120
    cors_origins: str = "http://localhost:3000"

    @field_validator("cors_origins")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def local_base_url(self) -> str:
        if self.local_provider_type == "vllm":
            return self.vllm_base_url
        return self.ollama_base_url


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
