"""Builds provider instances from resolved runtime settings.

This is the only place that decides which concrete adapter backs the "local" or
"openai" engine key. Everything above it works against the abstract contracts.
"""

from __future__ import annotations

from app.core.errors import PolicyError, ValidationError
from app.providers.base import EmbeddingProvider, LLMProvider, OCRProvider
from app.providers.embedding.ollama import OllamaEmbeddingProvider
from app.providers.embedding.openai_compatible import OpenAICompatibleEmbeddingProvider
from app.providers.llm.ollama import OllamaProvider
from app.providers.llm.openai_compatible import OpenAICompatibleProvider
from app.providers.ocr.http_ocr import HttpOcrProvider
from app.services.settings_service import EngineSettings

PROVIDER_KEYS = ("local", "openai")

PROVIDER_LABELS = {"local": "Local AI", "openai": "OpenAI API"}

PROVIDER_PRIVACY_NOTE = {
    "local": "การประมวลผล AI ทำงานผ่านระบบภายในที่กำหนด",
    "openai": "ข้อมูลที่เกี่ยวข้องกับคำถามอาจถูกส่งไปยังบริการภายนอกเพื่อประมวลผล",
}


def build_llm_provider(config: EngineSettings, provider_key: str) -> LLMProvider:
    _assert_known(provider_key)
    if provider_key == "local":
        local = config.local
        if local.provider_type == "ollama":
            return OllamaProvider(base_url=local.base_url, api_key=local.api_key)
        label = "Local AI (vLLM)" if local.provider_type == "vllm" else "Local AI"
        return OpenAICompatibleProvider(
            key="local",
            base_url=_v1(local.base_url),
            api_key=local.api_key,
            external=False,
            label=label,
        )
    if config.local_only_mode:
        raise PolicyError("ระบบเปิดใช้งาน Local Only Mode จึงไม่อนุญาตให้เรียกบริการภายนอก")
    return OpenAICompatibleProvider(
        key="openai",
        base_url=config.openai.base_url,
        api_key=config.openai.api_key,
        external=True,
        label="OpenAI API",
    )


def build_embedding_provider(config: EngineSettings, provider_key: str) -> EmbeddingProvider:
    _assert_known(provider_key)
    if provider_key == "local":
        local = config.local
        if local.provider_type == "ollama":
            return OllamaEmbeddingProvider(base_url=local.base_url, api_key=local.api_key)
        return OpenAICompatibleEmbeddingProvider(
            key="local",
            base_url=_v1(local.base_url),
            api_key=local.api_key,
            external=False,
            label="Local Embedding",
        )
    if config.local_only_mode:
        raise PolicyError("ระบบเปิดใช้งาน Local Only Mode จึงไม่อนุญาตให้เรียกบริการภายนอก")
    return OpenAICompatibleEmbeddingProvider(
        key="openai",
        base_url=config.openai.base_url,
        api_key=config.openai.api_key,
        external=True,
        label="OpenAI Embedding",
    )


def build_ocr_provider(base_url: str) -> OCRProvider:
    return HttpOcrProvider(base_url=base_url)


def default_model_for(config: EngineSettings, provider_key: str) -> str:
    return config.local.default_model if provider_key == "local" else config.openai.default_model


def default_embedding_model_for(config: EngineSettings, provider_key: str) -> str:
    return (
        config.local.default_embedding_model
        if provider_key == "local"
        else config.openai.default_embedding_model
    )


def _assert_known(provider_key: str) -> None:
    if provider_key not in PROVIDER_KEYS:
        raise ValidationError(f"ไม่รู้จัก AI Engine: {provider_key}")


def _v1(base_url: str) -> str:
    """vLLM and other OpenAI-compatible servers expose the API under /v1."""
    trimmed = base_url.rstrip("/")
    if not trimmed:
        return ""
    return trimmed if trimmed.endswith("/v1") else f"{trimmed}/v1"
