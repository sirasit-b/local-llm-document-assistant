"""Semantic search over indexed chunks, without generation."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.models import SearchHitOut, SearchRequest
from app.services import search_service

router = APIRouter(prefix="/api/search", tags=["search"])


@router.post("", response_model=list[SearchHitOut])
async def search(request: SearchRequest, db: Session = Depends(get_db)) -> list[SearchHitOut]:
    hits = await search_service.search(
        db,
        request.query,
        document_scope=list(request.document_scope) or None,
        top_k=request.top_k,
    )
    return [
        SearchHitOut(
            document_id=h.document_id,
            document_name=h.document_name,
            page_number=h.page_number,
            chunk_index=h.chunk_index,
            score=h.score,
            content=h.content,
        )
        for h in hits
    ]
