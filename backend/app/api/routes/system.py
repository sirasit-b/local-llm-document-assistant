"""Liveness and aggregate system status."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.models import SystemStatusOut
from app.services.system_service import system_status

router = APIRouter(tags=["system"])


@router.get("/api/health")
def health() -> dict:
    """Liveness only: the process is up and serving."""
    return {"status": "ok"}


@router.get("/api/system/status", response_model=SystemStatusOut)
async def status(db: Session = Depends(get_db)) -> SystemStatusOut:
    return SystemStatusOut(**await system_status(db))
