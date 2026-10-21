"""Internal data source registry."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.models import SourceIn, SourceOut
from app.services import source_service

router = APIRouter(prefix="/api/sources", tags=["sources"])


@router.get("", response_model=list[SourceOut])
def list_sources(db: Session = Depends(get_db)) -> list[SourceOut]:
    return [SourceOut.model_validate(s) for s in source_service.list_sources(db)]


@router.post("", response_model=SourceOut, status_code=status.HTTP_201_CREATED)
def create_source(payload: SourceIn, db: Session = Depends(get_db)) -> SourceOut:
    source = source_service.create_source(
        db,
        name=payload.name,
        source_type=payload.source_type,
        base_url=payload.base_url,
        config=payload.config,
    )
    return SourceOut.model_validate(source)


@router.post("/{source_id}/test", response_model=SourceOut)
async def test_source(source_id: uuid.UUID, db: Session = Depends(get_db)) -> SourceOut:
    return SourceOut.model_validate(await source_service.test_source(db, source_id))


@router.delete("/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_source(source_id: uuid.UUID, db: Session = Depends(get_db)):
    source_service.delete_source(db, source_id)
