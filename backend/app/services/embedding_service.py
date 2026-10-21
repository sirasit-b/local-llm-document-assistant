"""Embedding orchestration, independent of the chat LLM provider."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.errors import ProviderError, ValidationError
from app.providers.registry import build_embedding_provider, default_embedding_model_for
from app.services.settings_service import EngineSettings, load_settings

BATCH_SIZE = 32


@dataclass(frozen=True)
class EmbeddingRun:
    provider: str
    model: str
    vectors: list[list[float]]

    @property
    def dim(self) -> int:
        return len(self.vectors[0]) if self.vectors else 0


def resolve_embedding_target(config: EngineSettings) -> tuple[str, str]:
    """Return the (provider, model) the system should embed with."""
    provider = config.default_embedding_provider
    if not config.provider_enabled(provider):
        raise ValidationError(
            "ยังไม่ได้เปิดใช้งาน Embedding Provider กรุณาตั้งค่าที่ ตั้งค่าระบบ → AI Engines"
        )
    model = default_embedding_model_for(config, provider)
    if not model:
        raise ValidationError(
            "ยังไม่ได้เลือก Embedding Model กรุณาตั้งค่าที่ ตั้งค่าระบบ → AI Engines"
        )
    return provider, model


async def embed_texts(db: Session, texts: list[str]) -> EmbeddingRun:
    config = load_settings(db)
    provider_key, model = resolve_embedding_target(config)
    provider = build_embedding_provider(config, provider_key)

    vectors: list[list[float]] = []
    for start in range(0, len(texts), BATCH_SIZE):
        batch = texts[start : start + BATCH_SIZE]
        result = await provider.embed(batch, model=model)
        if len(result) != len(batch):
            raise ProviderError("Embedding Provider ส่งผลลัพธ์ไม่ครบตามจำนวนข้อความ")
        vectors.extend(result)

    dims = {len(v) for v in vectors}
    if len(dims) > 1:
        raise ProviderError("Embedding Provider ส่งเวกเตอร์ที่มีขนาดไม่เท่ากัน")
    return EmbeddingRun(provider=provider_key, model=model, vectors=vectors)
