"""Retrieval-Augmented Generation.

The pipeline is provider-agnostic: retrieval, prompt construction and citation
extraction are identical whether the answer comes from Ollama, vLLM or OpenAI.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from dataclasses import asdict, dataclass

from sqlalchemy.orm import Session

from app.providers.base import ChatMessage
from app.services import llm_service, search_service
from app.services.llm_service import ResolvedEngine
from app.services.search_service import RetrievedChunk

INSUFFICIENT_CONTEXT_MESSAGE = "ไม่พบข้อมูลที่เพียงพอจากเอกสารที่มีอยู่"

SYSTEM_PROMPT = """คุณคือผู้ช่วยตอบคำถามจากเอกสารภายในองค์กร

กติกาที่ต้องปฏิบัติตามอย่างเคร่งครัด:
1. ตอบโดยอ้างอิงจากเนื้อหาในส่วน "เอกสารอ้างอิง" เท่านั้น ห้ามใช้ความรู้ภายนอก
2. หากข้อมูลในเอกสารไม่เพียงพอ ให้ตอบว่า "{insufficient}" โดยไม่ต้องเดา
3. ระบุหมายเลขแหล่งอ้างอิงในรูปแบบ [1] [2] ต่อท้ายข้อความที่อ้างถึงเอกสารนั้น
4. ตอบเป็นภาษาไทยด้วยถ้อยคำกระชับ ชัดเจน และเป็นกลาง""".format(
    insufficient=INSUFFICIENT_CONTEXT_MESSAGE
)


@dataclass(frozen=True)
class Citation:
    index: int
    document_id: str
    document_name: str
    page_number: int | None
    chunk_index: int
    score: float
    excerpt: str


@dataclass(frozen=True)
class RagContext:
    engine: ResolvedEngine
    messages: list[ChatMessage]
    citations: list[Citation]

    @property
    def has_context(self) -> bool:
        return bool(self.citations)


def _to_citation(index: int, chunk: RetrievedChunk) -> Citation:
    excerpt = chunk.content.strip()
    return Citation(
        index=index,
        document_id=str(chunk.document_id),
        document_name=chunk.document_name,
        page_number=chunk.page_number,
        chunk_index=chunk.chunk_index,
        score=chunk.score,
        excerpt=excerpt[:320] + ("…" if len(excerpt) > 320 else ""),
    )


def _build_context_block(chunks: list[RetrievedChunk]) -> str:
    blocks = []
    for position, chunk in enumerate(chunks, start=1):
        location = f"หน้า {chunk.page_number}" if chunk.page_number else "ไม่ระบุหน้า"
        blocks.append(f"[{position}] {chunk.document_name} ({location})\n{chunk.content}")
    return "\n\n".join(blocks)


async def build_context(
    db: Session,
    *,
    question: str,
    provider_key: str | None,
    model: str | None,
    document_scope: list[uuid.UUID] | None,
    history: list[ChatMessage] | None = None,
) -> RagContext:
    engine = await llm_service.resolve_engine(db, provider_key=provider_key, model=model)
    chunks = await search_service.search(db, question, document_scope=document_scope)
    citations = [_to_citation(i, c) for i, c in enumerate(chunks, start=1)]

    if not chunks:
        return RagContext(engine=engine, messages=[], citations=[])

    user_prompt = (
        "เอกสารอ้างอิง:\n"
        f"{_build_context_block(chunks)}\n\n"
        "คำถาม:\n"
        f"{question.strip()}"
    )
    messages = [ChatMessage(role="system", content=SYSTEM_PROMPT)]
    messages.extend(history or [])
    messages.append(ChatMessage(role="user", content=user_prompt))
    return RagContext(engine=engine, messages=messages, citations=citations)


def is_refusal(answer: str) -> bool:
    """True when the model reported that the documents do not support an answer.

    Retrieval can surface weakly related chunks; citing them next to a refusal
    would imply support that is not there.
    """
    return INSUFFICIENT_CONTEXT_MESSAGE in answer.strip()[: len(INSUFFICIENT_CONTEXT_MESSAGE) + 20]


def citations_for(context: RagContext, answer: str) -> list[dict]:
    if is_refusal(answer):
        return []
    return [asdict(c) for c in context.citations]


async def answer(context: RagContext) -> tuple[str, list[dict]]:
    if not context.has_context:
        return INSUFFICIENT_CONTEXT_MESSAGE, []
    result = await llm_service.chat(context.engine, context.messages)
    return result.content, citations_for(context, result.content)


def stream_answer(context: RagContext) -> AsyncIterator[str]:
    return llm_service.stream(context.engine, context.messages)
