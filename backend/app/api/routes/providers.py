"""Provider discovery, model listing and per-provider health."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.errors import ProviderError, ValidationError
from app.db.session import get_db
from app.providers.registry import (
    PROVIDER_KEYS,
    PROVIDER_LABELS,
    PROVIDER_PRIVACY_NOTE,
    build_llm_provider,
    default_model_for,
)
from app.schemas.models import ModelOut, ProviderHealthOut, ProviderOut
from app.services.settings_service import load_settings

router = APIRouter(prefix="/api/providers", tags=["providers"])


@router.get("", response_model=list[ProviderOut])
def list_providers(db: Session = Depends(get_db)) -> list[ProviderOut]:
    """Only engines the administrator enabled are exposed to users."""
    config = load_settings(db)
    out: list[ProviderOut] = []
    for key in PROVIDER_KEYS:
        if not config.provider_enabled(key):
            continue
        out.append(
            ProviderOut(
                key=key,
                label=PROVIDER_LABELS[key],
                enabled=True,
                external=key == "openai",
                privacy_note=PROVIDER_PRIVACY_NOTE[key],
                default_model=default_model_for(config, key) or None,
                is_default=config.default_llm_provider == key,
            )
        )
    return out


@router.get("/{provider_key}/models", response_model=list[ModelOut])
async def list_models(provider_key: str, db: Session = Depends(get_db)) -> list[ModelOut]:
    config = load_settings(db)
    if provider_key not in PROVIDER_KEYS:
        raise ValidationError(f"ไม่รู้จัก AI Engine: {provider_key}")
    if not config.provider_enabled(provider_key):
        raise ValidationError(f"{PROVIDER_LABELS[provider_key]} ยังไม่ได้เปิดใช้งาน")
    provider = build_llm_provider(config, provider_key)
    models = await provider.get_models()
    return [ModelOut(id=m.id, label=m.label) for m in models]


@router.get("/{provider_key}/health", response_model=ProviderHealthOut)
async def provider_health(provider_key: str, db: Session = Depends(get_db)) -> ProviderHealthOut:
    config = load_settings(db)
    if provider_key not in PROVIDER_KEYS:
        raise ValidationError(f"ไม่รู้จัก AI Engine: {provider_key}")
    if not config.provider_enabled(provider_key):
        return ProviderHealthOut(key=provider_key, state="not_configured", detail="ยังไม่ได้เปิดใช้งาน")
    try:
        provider = build_llm_provider(config, provider_key)
        result = await provider.health_check()
    except ProviderError as exc:
        return ProviderHealthOut(key=provider_key, state="unavailable", detail=exc.message)
    return ProviderHealthOut(
        key=provider_key, state=result.state, detail=result.detail, latency_ms=result.latency_ms
    )
