"""Document upload, listing, preview and lifecycle endpoints.

Uploaded files are never served from a public path; every byte goes through
these authenticated endpoints.
"""

from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import NotFoundError, ValidationError
from app.core.security import Principal, get_current_principal
from app.db.session import get_db
from app.schemas.models import (
    DocumentListOut,
    DocumentOut,
    DocumentPageOut,
    DocumentPreviewOut,
    StatisticsOut,
)
from app.services import document_service

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.get("", response_model=DocumentListOut)
def list_documents(
    db: Session = Depends(get_db),
    q: str | None = Query(default=None, max_length=200),
    kind: str | None = Query(default=None, max_length=16),
    processing_status: str | None = Query(default=None, max_length=24),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> DocumentListOut:
    items, total = document_service.list_documents(
        db, query=q, kind=kind, status=processing_status, limit=limit, offset=offset
    )
    return DocumentListOut(items=[DocumentOut.model_validate(d) for d in items], total=total)


@router.get("/statistics", response_model=StatisticsOut)
def statistics(db: Session = Depends(get_db)) -> StatisticsOut:
    return StatisticsOut(**document_service.statistics(db))


@router.post("/upload", response_model=list[DocumentOut], status_code=status.HTTP_201_CREATED)
async def upload(
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
) -> list[DocumentOut]:
    if not files:
        raise ValidationError("ไม่พบไฟล์ที่อัปโหลด")

    created = []
    for upload_file in files:
        content = await upload_file.read()
        if len(content) > settings.max_upload_bytes:
            raise ValidationError(f"ไฟล์ {upload_file.filename} ใหญ่เกิน {settings.max_upload_mb} MB")
        document = document_service.create_document(
            db,
            filename=upload_file.filename or "untitled",
            content=content,
            content_type=upload_file.content_type,
            owner=principal.subject,
        )
        created.append(DocumentOut.model_validate(document))
    return created


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(document_id: uuid.UUID, db: Session = Depends(get_db)) -> DocumentOut:
    return DocumentOut.model_validate(document_service.get_document(db, document_id))


@router.get("/{document_id}/preview", response_model=DocumentPreviewOut)
def preview(document_id: uuid.UUID, db: Session = Depends(get_db)) -> DocumentPreviewOut:
    document = document_service.get_document(db, document_id)
    pages = document_service.get_pages(db, document_id)
    return DocumentPreviewOut(
        document=DocumentOut.model_validate(document),
        pages=[DocumentPageOut.model_validate(p) for p in pages],
    )


@router.get("/{document_id}/file")
def original_file(document_id: uuid.UUID, db: Session = Depends(get_db)) -> FileResponse:
    document = document_service.get_document(db, document_id)
    path = Path(document.storage_path)
    if not path.exists():
        raise NotFoundError("ไม่พบไฟล์ต้นฉบับ")
    return FileResponse(
        path,
        media_type=document.mime_type,
        filename=document.filename,
        content_disposition_type="inline",
    )


@router.post("/{document_id}/reprocess", response_model=DocumentOut)
def reprocess(document_id: uuid.UUID, db: Session = Depends(get_db)) -> DocumentOut:
    return DocumentOut.model_validate(document_service.mark_for_reprocess(db, document_id))


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(document_id: uuid.UUID, db: Session = Depends(get_db)):
    document_service.delete_document(db, document_id)
