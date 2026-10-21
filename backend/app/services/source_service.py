"""Internal data sources.

A source is only ever reported as connected after a real reachability check.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError, ValidationError
from app.db.models import DataSource

SOURCE_TYPES = ("database", "rest_api", "erp", "crm", "file_storage")


def list_sources(db: Session) -> list[DataSource]:
    return list(db.execute(select(DataSource).order_by(DataSource.created_at.desc())).scalars().all())


def create_source(
    db: Session, *, name: str, source_type: str, base_url: str | None, config: dict | None
) -> DataSource:
    if source_type not in SOURCE_TYPES:
        raise ValidationError(f"ไม่รองรับแหล่งข้อมูลประเภท {source_type}")
    if base_url and not base_url.startswith(("http://", "https://")):
        raise ValidationError("Base URL ต้องขึ้นต้นด้วย http:// หรือ https://")
    source = DataSource(
        name=name.strip(),
        source_type=source_type,
        base_url=base_url,
        config=config or {},
        enabled=False,
        last_status="unknown",
    )
    db.add(source)
    db.commit()
    db.refresh(source)
    return source


def delete_source(db: Session, source_id: uuid.UUID) -> None:
    source = get_source(db, source_id)
    db.delete(source)
    db.commit()


def get_source(db: Session, source_id: uuid.UUID) -> DataSource:
    source = db.get(DataSource, source_id)
    if source is None:
        raise NotFoundError("ไม่พบแหล่งข้อมูล")
    return source


async def test_source(db: Session, source_id: uuid.UUID) -> DataSource:
    """Probe a source and record the real outcome."""
    source = get_source(db, source_id)
    source.last_checked_at = datetime.now(timezone.utc)

    if source.source_type in ("rest_api", "erp", "crm") and source.base_url:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(source.base_url)
                response.raise_for_status()
            source.last_status = "available"
            source.last_error = None
        except httpx.HTTPError:
            source.last_status = "unavailable"
            source.last_error = "ไม่สามารถเชื่อมต่อได้"
    else:
        source.last_status = "unsupported"
        source.last_error = "ยังไม่รองรับการทดสอบการเชื่อมต่อสำหรับแหล่งข้อมูลประเภทนี้"

    source.enabled = source.last_status == "available"
    db.commit()
    db.refresh(source)
    return source
