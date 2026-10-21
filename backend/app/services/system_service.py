"""Real health checks for every dependency shown in the UI."""

from __future__ import annotations

import asyncio
import time

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import engine
from app.providers.base import HealthResult
from app.providers.registry import build_embedding_provider, build_llm_provider
from app.services import ocr_service
from app.services.settings_service import EngineSettings, load_settings


async def _database_health() -> HealthResult:
    started = time.perf_counter()
    try:
        await asyncio.to_thread(_ping_database)
    except Exception as exc:  # noqa: BLE001 - surfaced as a status, not raised
        return HealthResult(state="unavailable", detail=type(exc).__name__)
    return HealthResult(state="available", latency_ms=int((time.perf_counter() - started) * 1000))


def _ping_database() -> None:
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))


async def _vector_health() -> HealthResult:
    try:
        installed = await asyncio.to_thread(_pgvector_installed)
    except Exception as exc:  # noqa: BLE001
        return HealthResult(state="unavailable", detail=type(exc).__name__)
    if not installed:
        return HealthResult(state="degraded", detail="ยังไม่ได้ติดตั้งส่วนขยาย pgvector")
    return HealthResult(state="available")


def _pgvector_installed() -> bool:
    with engine.connect() as conn:
        return bool(
            conn.execute(text("SELECT 1 FROM pg_extension WHERE extname = 'vector'")).first()
        )


async def _llm_health(config: EngineSettings) -> HealthResult:
    provider_key = config.default_llm_provider
    if not config.provider_enabled(provider_key):
        return HealthResult(state="not_configured", detail="ยังไม่ได้เปิดใช้งาน AI Engine")
    return await build_llm_provider(config, provider_key).health_check()


async def _embedding_health(config: EngineSettings) -> HealthResult:
    provider_key = config.default_embedding_provider
    if not config.provider_enabled(provider_key):
        return HealthResult(state="not_configured", detail="ยังไม่ได้เปิดใช้งาน Embedding Provider")
    return await build_embedding_provider(config, provider_key).health_check()


async def _ocr_health() -> HealthResult:
    if not ocr_service.ocr_configured():
        return HealthResult(state="not_configured", detail="ยังไม่ได้ตั้งค่า OCR Service")
    return await ocr_service.ocr_health()


async def system_status(db: Session) -> dict:
    config = load_settings(db)
    database, vector, llm, embedding, ocr = await asyncio.gather(
        _database_health(),
        _vector_health(),
        _llm_health(config),
        _embedding_health(config),
        _ocr_health(),
    )
    services = {
        "backend": HealthResult(state="available"),
        "database": database,
        "vector_db": vector,
        "llm": llm,
        "embedding": embedding,
        "ocr": ocr,
    }
    return {
        "services": [
            {
                "key": key,
                "state": result.state,
                "detail": result.detail,
                "latency_ms": result.latency_ms,
            }
            for key, result in services.items()
        ],
        "local_only_mode": config.local_only_mode,
        "app_env": settings.app_env,
    }
