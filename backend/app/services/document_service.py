"""Document storage, listing and the ingestion pipeline.

Pipeline: validate → extract → OCR (when needed) → clean → chunk → embed →
index → ready. Every stage writes its real state to the database; nothing is
marked complete unless it completed.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AppError, NotFoundError, ValidationError
from app.core.security import checksum, validate_upload
from app.db.models import (
    Document,
    DocumentChunk,
    DocumentPage,
    IndexStatus,
    OcrStatus,
    ProcessingStatus,
)
from app.parsers import text_extraction
from app.parsers.chunking import chunk_pages
from app.services import ocr_service
from app.services.embedding_service import embed_texts

logger = logging.getLogger(__name__)

MIME_BY_KIND = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "txt": "text/plain",
    "csv": "text/csv",
    "image": "image/png",
}


def storage_root() -> Path:
    root = Path(settings.storage_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


def create_document(
    db: Session, *, filename: str, content: bytes, content_type: str | None, owner: str
) -> Document:
    safe_name, kind = validate_upload(filename, len(content))
    digest = checksum(content)

    document_id = uuid.uuid4()
    target = storage_root() / str(document_id)[:2] / f"{document_id}{Path(safe_name).suffix.lower()}"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)

    document = Document(
        id=document_id,
        filename=safe_name,
        kind=kind,
        mime_type=content_type or MIME_BY_KIND.get(kind, "application/octet-stream"),
        size_bytes=len(content),
        checksum=digest,
        storage_path=str(target),
        source="upload",
        processing_status=ProcessingStatus.pending,
        index_status=IndexStatus.not_indexed,
        ocr_status=OcrStatus.pending if kind in ("image", "pdf") else OcrStatus.not_required,
        owner_subject=owner,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


def list_documents(
    db: Session,
    *,
    query: str | None = None,
    kind: str | None = None,
    status: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[Document], int]:
    stmt = select(Document)
    count_stmt = select(func.count()).select_from(Document)
    if query:
        pattern = f"%{query.strip()}%"
        stmt = stmt.where(Document.filename.ilike(pattern))
        count_stmt = count_stmt.where(Document.filename.ilike(pattern))
    if kind:
        stmt = stmt.where(Document.kind == kind)
        count_stmt = count_stmt.where(Document.kind == kind)
    if status:
        stmt = stmt.where(Document.processing_status == ProcessingStatus(status))
        count_stmt = count_stmt.where(Document.processing_status == ProcessingStatus(status))
    stmt = stmt.order_by(Document.created_at.desc()).limit(limit).offset(offset)
    total = db.execute(count_stmt).scalar_one()
    return list(db.execute(stmt).scalars().all()), total


def get_document(db: Session, document_id: uuid.UUID) -> Document:
    document = db.get(Document, document_id)
    if document is None:
        raise NotFoundError("ไม่พบเอกสาร")
    return document


def delete_document(db: Session, document_id: uuid.UUID) -> None:
    document = get_document(db, document_id)
    path = Path(document.storage_path)
    db.delete(document)
    db.commit()
    try:
        path.unlink(missing_ok=True)
    except OSError:
        logger.warning("could not remove file for document %s", document_id)


def mark_for_reprocess(db: Session, document_id: uuid.UUID) -> Document:
    document = get_document(db, document_id)
    document.processing_status = ProcessingStatus.pending
    document.index_status = IndexStatus.not_indexed
    document.error_message = None
    if document.kind in ("image", "pdf"):
        document.ocr_status = OcrStatus.pending
    db.query(DocumentChunk).filter(DocumentChunk.document_id == document.id).delete()
    db.query(DocumentPage).filter(DocumentPage.document_id == document.id).delete()
    document.chunk_count = 0
    db.commit()
    db.refresh(document)
    return document


def get_pages(db: Session, document_id: uuid.UUID) -> list[DocumentPage]:
    return list(
        db.execute(
            select(DocumentPage)
            .where(DocumentPage.document_id == document_id)
            .order_by(DocumentPage.page_number)
        )
        .scalars()
        .all()
    )


def statistics(db: Session) -> dict:
    total = db.execute(select(func.count()).select_from(Document)).scalar_one()
    if total == 0:
        return {"total_documents": 0, "by_kind": [], "storage_bytes": 0, "ready": 0, "failed": 0, "processing": 0}
    by_kind = db.execute(
        select(Document.kind, func.count()).group_by(Document.kind).order_by(func.count().desc())
    ).all()
    storage = db.execute(select(func.coalesce(func.sum(Document.size_bytes), 0))).scalar_one()
    ready = db.execute(
        select(func.count()).select_from(Document).where(Document.processing_status == ProcessingStatus.ready)
    ).scalar_one()
    failed = db.execute(
        select(func.count()).select_from(Document).where(Document.processing_status == ProcessingStatus.failed)
    ).scalar_one()
    return {
        "total_documents": total,
        "by_kind": [{"kind": k, "count": c} for k, c in by_kind],
        "storage_bytes": int(storage),
        "ready": ready,
        "failed": failed,
        "processing": total - ready - failed,
    }


def claim_next_pending(db: Session) -> Document | None:
    """Atomically take one pending document for processing."""
    document = (
        db.execute(
            select(Document)
            .where(Document.processing_status == ProcessingStatus.pending)
            .order_by(Document.created_at)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        .scalars()
        .first()
    )
    if document is None:
        return None
    document.processing_status = ProcessingStatus.validating
    db.commit()
    db.refresh(document)
    return document


async def process_document(db: Session, document: Document) -> None:
    """Run the full ingestion pipeline for one document."""
    try:
        path = Path(document.storage_path)
        if not path.exists():
            raise ValidationError("ไม่พบไฟล์ต้นฉบับในพื้นที่จัดเก็บ")

        _advance(db, document, ProcessingStatus.extracting)
        parsed = text_extraction.extract(path, document.kind)
        pages = list(parsed.pages)
        ocr_confidence: float | None = None

        if parsed.needs_ocr:
            _advance(db, document, ProcessingStatus.ocr)
            pages, ocr_confidence = await ocr_service.run_ocr(db, document)
        elif document.ocr_status == OcrStatus.pending:
            document.ocr_status = OcrStatus.not_required
            db.commit()

        pages = [p for p in pages if p.content.strip()]
        if not pages:
            raise ValidationError("ไม่พบข้อความในเอกสารนี้")

        _advance(db, document, ProcessingStatus.chunking)
        db.query(DocumentPage).filter(DocumentPage.document_id == document.id).delete()
        for page in pages:
            db.add(
                DocumentPage(
                    document_id=document.id,
                    page_number=page.page_number,
                    content=page.content,
                    ocr_confidence=ocr_confidence,
                )
            )
        db.commit()

        chunks = chunk_pages(pages, size=settings.chunk_size, overlap=settings.chunk_overlap)
        if not chunks:
            raise ValidationError("ไม่สามารถแบ่งเนื้อหาเอกสารได้")

        _advance(db, document, ProcessingStatus.embedding)
        run = await embed_texts(db, [c.content for c in chunks])

        _advance(db, document, ProcessingStatus.indexing)
        document.index_status = IndexStatus.indexing
        db.query(DocumentChunk).filter(DocumentChunk.document_id == document.id).delete()
        for chunk, vector in zip(chunks, run.vectors, strict=True):
            db.add(
                DocumentChunk(
                    document_id=document.id,
                    chunk_index=chunk.index,
                    page_number=chunk.page_number,
                    content=chunk.content,
                    token_estimate=chunk.token_estimate,
                    embedding=vector,
                    embedding_model=run.model,
                )
            )

        document.page_count = len(pages)
        document.char_count = sum(len(p.content) for p in pages)
        document.chunk_count = len(chunks)
        document.embedding_provider = run.provider
        document.embedding_model = run.model
        document.embedding_dim = run.dim
        document.index_status = IndexStatus.indexed
        document.processing_status = ProcessingStatus.ready
        document.error_message = None
        document.updated_at = datetime.now(timezone.utc)
        db.commit()
        logger.info("document %s ready (%d chunks)", document.id, len(chunks))
    except Exception as exc:  # noqa: BLE001 - recorded on the document, then re-raised
        db.rollback()
        document = db.get(Document, document.id)
        if document is not None:
            document.processing_status = ProcessingStatus.failed
            document.index_status = IndexStatus.failed
            document.error_message = exc.message if isinstance(exc, AppError) else "ประมวลผลเอกสารไม่สำเร็จ"
            db.commit()
        logger.exception("processing failed for document")


def _advance(db: Session, document: Document, status: ProcessingStatus) -> None:
    document.processing_status = status
    db.commit()
