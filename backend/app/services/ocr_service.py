"""OCR orchestration.

When no OCR engine is reachable the job is recorded as `unavailable`; the system
never fabricates extracted text.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import NotFoundError, ProviderError
from app.db.models import Document, OcrJob, OcrStatus
from app.parsers.text_extraction import ParsedPage, clean_text
from app.providers.registry import build_ocr_provider

OCR_LANGUAGES = "tha+eng"

MIME_BY_KIND = {"pdf": "application/pdf", "image": "image/png"}


def ocr_configured() -> bool:
    return bool(settings.ocr_base_url)


async def ocr_health():
    return await build_ocr_provider(settings.ocr_base_url).health_check()


async def run_ocr(db: Session, document: Document) -> tuple[list[ParsedPage], float | None]:
    """OCR a document and persist a job record. Raises ProviderError on failure."""
    job = OcrJob(document_id=document.id, status=OcrStatus.running, provider=settings.ocr_provider)
    db.add(job)
    document.ocr_status = OcrStatus.running
    db.commit()

    if not ocr_configured():
        job.status = OcrStatus.unavailable
        job.error_message = "ยังไม่ได้ตั้งค่า OCR Service"
        document.ocr_status = OcrStatus.unavailable
        db.commit()
        raise ProviderError("ยังไม่ได้ตั้งค่า OCR Service")

    provider = build_ocr_provider(settings.ocr_base_url)
    data = Path(document.storage_path).read_bytes()
    try:
        result = await provider.extract(
            data, mime_type=document.mime_type or MIME_BY_KIND.get(document.kind, "application/octet-stream"),
            languages=OCR_LANGUAGES,
        )
    except ProviderError as exc:
        job.status = OcrStatus.failed
        job.error_message = str(exc)
        job.completed_at = datetime.now(timezone.utc)
        document.ocr_status = OcrStatus.failed
        db.commit()
        raise

    pages = [ParsedPage(page_number=p.page_number, content=clean_text(p.text)) for p in result.pages]
    confidences = [p.confidence for p in result.pages if p.confidence is not None]
    average = sum(confidences) / len(confidences) if confidences else result.confidence

    job.status = OcrStatus.completed
    job.confidence = average
    job.pages_processed = len(pages)
    job.provider = result.provider
    job.completed_at = datetime.now(timezone.utc)
    document.ocr_status = OcrStatus.completed
    db.commit()
    return pages, average


def list_ocr_documents(db: Session) -> list[tuple[Document, OcrJob | None]]:
    documents = (
        db.execute(
            select(Document)
            .where(Document.ocr_status != OcrStatus.not_required)
            .order_by(Document.created_at.desc())
        )
        .scalars()
        .all()
    )
    out: list[tuple[Document, OcrJob | None]] = []
    for document in documents:
        job = (
            db.execute(
                select(OcrJob)
                .where(OcrJob.document_id == document.id)
                .order_by(OcrJob.created_at.desc())
                .limit(1)
            )
            .scalars()
            .first()
        )
        out.append((document, job))
    return out


def get_document_or_404(db: Session, document_id: uuid.UUID) -> Document:
    document = db.get(Document, document_id)
    if document is None:
        raise NotFoundError("ไม่พบเอกสาร")
    return document
