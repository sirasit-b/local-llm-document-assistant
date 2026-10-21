"""OCR jobs. Documents are queued through the normal ingestion pipeline."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.errors import ValidationError
from app.db.session import get_db
from app.schemas.models import OcrJobOut, ProviderHealthOut
from app.services import document_service, ocr_service

router = APIRouter(prefix="/api/ocr", tags=["ocr"])


@router.get("", response_model=list[OcrJobOut])
def list_jobs(db: Session = Depends(get_db)) -> list[OcrJobOut]:
    out: list[OcrJobOut] = []
    for document, job in ocr_service.list_ocr_documents(db):
        out.append(
            OcrJobOut(
                document_id=document.id,
                filename=document.filename,
                kind=document.kind,
                status=document.ocr_status.value,
                confidence=job.confidence if job else None,
                pages_processed=job.pages_processed if job else 0,
                error_message=job.error_message if job else None,
                created_at=job.created_at if job else document.created_at,
            )
        )
    return out


@router.get("/health", response_model=ProviderHealthOut)
async def health() -> ProviderHealthOut:
    if not ocr_service.ocr_configured():
        return ProviderHealthOut(key="ocr", state="not_configured", detail="ยังไม่ได้ตั้งค่า OCR Service")
    result = await ocr_service.ocr_health()
    return ProviderHealthOut(
        key="ocr", state=result.state, detail=result.detail, latency_ms=result.latency_ms
    )


@router.post("/{document_id}/rerun", response_model=OcrJobOut)
def rerun(document_id: uuid.UUID, db: Session = Depends(get_db)) -> OcrJobOut:
    document = document_service.get_document(db, document_id)
    if document.kind not in ("pdf", "image"):
        raise ValidationError("เอกสารนี้ไม่รองรับการทำ OCR")
    document_service.mark_for_reprocess(db, document_id)
    db.refresh(document)
    return OcrJobOut(
        document_id=document.id,
        filename=document.filename,
        kind=document.kind,
        status=document.ocr_status.value,
        confidence=None,
        pages_processed=0,
        error_message=None,
        created_at=document.created_at,
    )
