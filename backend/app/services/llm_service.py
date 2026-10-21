"""LLM access with server-side provider and model validation.

The client may ask for a provider and a model, but never for a URL or a
credential: both are resolved from administrator settings on the backend.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.errors import PolicyError, ValidationError
from app.providers.base import ChatMessage, ChatResult, LLMProvider
from app.providers.registry import (
    PROVIDER_LABELS,
    build_llm_provider,
    default_model_for,
)
from app.services.settings_service import EngineSettings, load_settings


@dataclass(frozen=True)
class ResolvedEngine:
    provider_key: str
    provider: LLMProvider
    model: str
    external: bool

    @property
    def label(self) -> str:
        return PROVIDER_LABELS[self.provider_key]


async def resolve_engine(
    db: Session, *, provider_key: str | None, model: str | None
) -> ResolvedEngine:
    config = load_settings(db)
    key = provider_key or config.default_llm_provider

    if key not in PROVIDER_LABELS:
        raise ValidationError(f"ไม่รู้จัก AI Engine: {key}")
    if key == "openai" and config.local_only_mode:
        raise PolicyError("ระบบเปิดใช้งาน Local Only Mode จึงไม่อนุญาตให้ใช้บริการภายนอก")
    if not config.provider_enabled(key):
        raise ValidationError(f"{PROVIDER_LABELS[key]} ยังไม่ได้เปิดใช้งานโดยผู้ดูแลระบบ")

    provider = build_llm_provider(config, key)
    selected = (model or "").strip() or default_model_for(config, key)
    if not selected:
        raise ValidationError(f"ยังไม่ได้เลือกโมเดลสำหรับ {PROVIDER_LABELS[key]}")

    await _assert_model_allowed(provider, selected, config, key)
    return ResolvedEngine(
        provider_key=key, provider=provider, model=selected, external=provider.external
    )


async def _assert_model_allowed(
    provider: LLMProvider, model: str, config: EngineSettings, key: str
) -> None:
    """Reject arbitrary model identifiers coming from the client."""
    if model == default_model_for(config, key):
        return
    available = {m.id for m in await provider.get_models()}
    if available and model not in available:
        raise ValidationError(f"โมเดล {model} ไม่พร้อมใช้งานบน {PROVIDER_LABELS[key]}")


async def chat(engine: ResolvedEngine, messages: list[ChatMessage]) -> ChatResult:
    return await engine.provider.chat(messages, model=engine.model)


def stream(engine: ResolvedEngine, messages: list[ChatMessage]) -> AsyncIterator[str]:
    return engine.provider.stream(messages, model=engine.model)
