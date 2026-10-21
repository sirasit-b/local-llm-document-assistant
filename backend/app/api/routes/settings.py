"""Administrator settings for AI engines.

API keys enter through this endpoint and never come back out: responses carry a
mask only.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.errors import PolicyError
from app.core.security import Principal, get_current_principal, mask_secret
from app.db.session import get_db
from app.schemas.models import LocalEngineOut, OpenAIEngineOut, SettingsIn, SettingsOut
from app.services.settings_service import EngineSettings, load_settings, save_settings

router = APIRouter(prefix="/api/settings", tags=["settings"])


def _require_admin(principal: Principal) -> None:
    if not principal.has_role("admin"):
        raise PolicyError("ต้องมีสิทธิ์ผู้ดูแลระบบ")


def _to_out(config: EngineSettings) -> SettingsOut:
    return SettingsOut(
        local=LocalEngineOut(
            enabled=config.local.enabled,
            provider_type=config.local.provider_type,
            base_url=config.local.base_url,
            api_key_masked=mask_secret(config.local.api_key),
            default_model=config.local.default_model,
            default_embedding_model=config.local.default_embedding_model,
        ),
        openai=OpenAIEngineOut(
            enabled=config.openai.enabled,
            base_url=config.openai.base_url,
            api_key_masked=mask_secret(config.openai.api_key),
            default_model=config.openai.default_model,
            default_embedding_model=config.openai.default_embedding_model,
        ),
        default_llm_provider=config.default_llm_provider,
        default_embedding_provider=config.default_embedding_provider,
        local_only_mode=config.local_only_mode,
    )


@router.get("", response_model=SettingsOut)
def get_settings_(
    db: Session = Depends(get_db), principal: Principal = Depends(get_current_principal)
) -> SettingsOut:
    _require_admin(principal)
    return _to_out(load_settings(db))


@router.put("", response_model=SettingsOut)
def update_settings(
    payload: SettingsIn,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
) -> SettingsOut:
    _require_admin(principal)
    patch = payload.model_dump(exclude_none=True)
    return _to_out(save_settings(db, patch))
