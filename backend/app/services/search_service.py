"""Vector retrieval over indexed document chunks."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import Document, DocumentChunk, ProcessingStatus
from app.services.embedding_service import embed_texts


@dataclass(frozen=True)
class RetrievedChunk:
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    document_name: str
    page_number: int | None
    chunk_index: int
    content: str
    score: float


async def search(
    db: Session,
    query: str,
    *,
    document_scope: list[uuid.UUID] | None = None,
    top_k: int | None = None,
    min_score: float | None = None,
) -> list[RetrievedChunk]:
    """Embed the query with the configured embedding model and return matches.

    Only chunks embedded with that same model are comparable, so the query is
    restricted to them.
    """
    cleaned = query.strip()
    if not cleaned:
        return []

    run = await embed_texts(db, [cleaned])
    if not run.vectors:
        return []
    vector = run.vectors[0]

    limit = top_k or settings.retrieval_top_k
    threshold = settings.min_relevance_score if min_score is None else min_score

    distance = DocumentChunk.embedding.cosine_distance(vector).label("distance")
    stmt = (
        select(DocumentChunk, Document.filename, distance)
        .join(Document, Document.id == DocumentChunk.document_id)
        .where(
            DocumentChunk.embedding.is_not(None),
            DocumentChunk.embedding_model == run.model,
            Document.processing_status == ProcessingStatus.ready,
        )
        .order_by(distance)
        .limit(limit)
    )
    if document_scope:
        stmt = stmt.where(Document.id.in_(document_scope))

    results: list[RetrievedChunk] = []
    for chunk, filename, dist in db.execute(stmt).all():
        score = 1.0 - float(dist)
        if score < threshold:
            continue
        results.append(
            RetrievedChunk(
                chunk_id=chunk.id,
                document_id=chunk.document_id,
                document_name=filename,
                page_number=chunk.page_number,
                chunk_index=chunk.chunk_index,
                content=chunk.content,
                score=round(score, 4),
            )
        )
    return results
