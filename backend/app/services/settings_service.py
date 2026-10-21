"""Runtime configuration resolved from environment defaults plus admin overrides.

Environment variables provide the baseline so a fresh deployment works without a
database write; administrators may then override anything from the UI. Secrets
are stored in `app_settings` and never leave the backend.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings as env
from app.core.errors import ValidationError
from app.db.models import AppSetting

SETTINGS_KEY = "ai_engines"

LOCAL_PROVIDER_TYPES = ("ollama", "vllm", "openai_compatible")


@dataclass
class LocalEngineConfig:
    enabled: bool = True
    provider_type: str = "ollama"
    base_url: str = ""
    api_key: str = ""
    default_model: str = ""
    default_embedding_model: str = ""


@dataclass
class OpenAIEngineConfig:
    enabled: bool = False
    api_key: str = ""
    base_url: str = "https://api.openai.com/v1"
    default_model: str = ""
    default_embedding_model: str = ""


@dataclass
class EngineSettings:
    local: LocalEngineConfig = field(default_factory=LocalEngineConfig)
    openai: OpenAIEngineConfig = field(default_factory=OpenAIEngineConfig)
    default_llm_provider: str = "openai"
    default_embedding_provider: str = "openai"
    local_only_mode: bool = False

    def provider_enabled(self, provider: str) -> bool:
        if provider == "local":
            return self.local.enabled
        if provider == "openai":
            return self.openai.enabled and not self.local_only_mode
        return False


def _env_defaults() -> EngineSettings:
    local_base = env.local_base_url
    return EngineSettings(
        local=LocalEngineConfig(
            enabled=bool(local_base),
            provider_type=env.local_provider_type,
            base_url=local_base,
            api_key=env.local_api_key,
            default_model=env.default_llm_model if env.default_llm_provider == "local" else "",
            default_embedding_model=(
                env.default_embedding_model if env.default_embedding_provider == "local" else ""
            ),
        ),
        openai=OpenAIEngineConfig(
            enabled=bool(env.openai_api_key) and not env.local_only_mode,
            api_key=env.openai_api_key,
            base_url=env.openai_base_url,
            default_model=env.default_llm_model if env.default_llm_provider == "openai" else "",
            default_embedding_model=(
                env.default_embedding_model if env.default_embedding_provider == "openai" else ""
            ),
        ),
        default_llm_provider=env.default_llm_provider,
        default_embedding_provider=env.default_embedding_provider,
        local_only_mode=env.local_only_mode,
    )


def load_settings(db: Session) -> EngineSettings:
    resolved = _env_defaults()
    row = db.get(AppSetting, SETTINGS_KEY)
    if row:
        _apply_overrides(resolved, row.value or {})
    # Local Only Mode is a hard switch: it disables the external engine regardless
    # of any other stored value.
    if resolved.local_only_mode:
        resolved.openai.enabled = False
        if resolved.default_llm_provider == "openai":
            resolved.default_llm_provider = "local"
        if resolved.default_embedding_provider == "openai":
            resolved.default_embedding_provider = "local"
    return resolved


def _apply_overrides(target: EngineSettings, stored: dict[str, Any]) -> None:
    local = stored.get("local") or {}
    openai = stored.get("openai") or {}
    for key in ("enabled", "provider_type", "base_url", "api_key", "default_model", "default_embedding_model"):
        if key in local and local[key] is not None:
            setattr(target.local, key, local[key])
    for key in ("enabled", "api_key", "base_url", "default_model", "default_embedding_model"):
        if key in openai and openai[key] is not None:
            setattr(target.openai, key, openai[key])
    for key in ("default_llm_provider", "default_embedding_provider", "local_only_mode"):
        if stored.get(key) is not None:
            setattr(target, key, stored[key])


def save_settings(db: Session, patch: dict[str, Any]) -> EngineSettings:
    """Merge an admin patch into stored settings.

    An omitted or empty `api_key` keeps whatever is already stored, so the UI can
    submit the form without ever having seen the secret.
    """
    row = db.get(AppSetting, SETTINGS_KEY)
    stored: dict[str, Any] = dict(row.value) if row and row.value else {}

    for engine in ("local", "openai"):
        incoming = patch.get(engine)
        if incoming is None:
            continue
        current = dict(stored.get(engine) or {})
        for key, value in incoming.items():
            if value is None:
                continue
            if key == "api_key":
                if value == "":
                    continue  # unchanged
                if value == "__clear__":
                    current[key] = ""
                    continue
            current[key] = value
        stored[engine] = current

    for key in ("default_llm_provider", "default_embedding_provider", "local_only_mode"):
        if patch.get(key) is not None:
            stored[key] = patch[key]

    _validate(stored)

    if row:
        row.value = stored
    else:
        db.add(AppSetting(key=SETTINGS_KEY, value=stored))
    db.commit()
    return load_settings(db)


def _validate(stored: dict[str, Any]) -> None:
    local = stored.get("local") or {}
    provider_type = local.get("provider_type")
    if provider_type and provider_type not in LOCAL_PROVIDER_TYPES:
        raise ValidationError(f"Provider Type ไม่ถูกต้อง: {provider_type}")
    for engine in ("local", "openai"):
        base_url = (stored.get(engine) or {}).get("base_url")
        if base_url and not str(base_url).startswith(("http://", "https://")):
            raise ValidationError("Base URL ต้องขึ้นต้นด้วย http:// หรือ https://")
    for key in ("default_llm_provider", "default_embedding_provider"):
        value = stored.get(key)
        if value and value not in ("local", "openai"):
            raise ValidationError(f"{key} ไม่ถูกต้อง")
