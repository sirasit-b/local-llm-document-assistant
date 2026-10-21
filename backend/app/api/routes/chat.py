"""Chat endpoints: a blocking answer and a streaming one.

Switching between Local AI and OpenAI is a field in the request body; nothing
is rebuilt or restarted. Moving to an external provider requires an explicit
acknowledgement from the client so data never leaves the environment silently.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator
from dataclasses import asdict

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.errors import AppError, PolicyError
from app.core.security import Principal, get_current_principal
from app.db.models import Conversation, Message
from app.db.session import get_db
from app.providers.base import ChatMessage
from app.schemas.models import ChatRequest, ChatResponse, CitationOut
from app.services import rag_service
from app.services.rag_service import INSUFFICIENT_CONTEXT_MESSAGE, RagContext

router = APIRouter(prefix="/api/chat", tags=["chat"])

HISTORY_TURNS = 6


def _conversation(db: Session, request: ChatRequest, principal: Principal) -> Conversation:
    if request.conversation_id:
        conversation = db.get(Conversation, request.conversation_id)
        if conversation is not None:
            return conversation
    conversation = Conversation(
        title=request.message.strip()[:120], owner_subject=principal.subject
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


def _history(conversation: Conversation) -> list[ChatMessage]:
    recent = conversation.messages[-HISTORY_TURNS:]
    return [ChatMessage(role=m.role, content=m.content) for m in recent if m.role in ("user", "assistant")]


async def _prepare(db: Session, request: ChatRequest, conversation: Conversation) -> RagContext:
    context = await rag_service.build_context(
        db,
        question=request.message,
        provider_key=request.provider,
        model=request.model,
        document_scope=list(request.document_scope) or None,
        history=_history(conversation),
    )
    if context.engine.external and not request.acknowledge_external:
        raise PolicyError(
            "การใช้งาน OpenAI API จะส่งข้อมูลที่เกี่ยวข้องออกนอกระบบ "
            "กรุณายืนยันก่อนดำเนินการ",
            code="external_confirmation_required",
        )
    return context


def _record(
    db: Session,
    conversation: Conversation,
    request: ChatRequest,
    context: RagContext,
    answer: str,
    citations: list[dict],
) -> Message:
    db.add(
        Message(
            conversation_id=conversation.id,
            role="user",
            content=request.message.strip(),
        )
    )
    message = Message(
        conversation_id=conversation.id,
        role="assistant",
        content=answer,
        provider=context.engine.provider_key,
        model=context.engine.model,
        citations=citations,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


@router.post("", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
) -> ChatResponse:
    conversation = _conversation(db, request, principal)
    context = await _prepare(db, request, conversation)
    answer, citations = await rag_service.answer(context)
    message = _record(db, conversation, request, context, answer, citations)
    return ChatResponse(
        conversation_id=conversation.id,
        message_id=message.id,
        provider=context.engine.provider_key,
        model=context.engine.model,
        external=context.engine.external,
        answer=answer,
        citations=[CitationOut(**c) for c in citations],
        has_context=context.has_context,
    )


@router.post("/stream")
async def chat_stream(
    request: ChatRequest,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
) -> StreamingResponse:
    conversation = _conversation(db, request, principal)
    context = await _prepare(db, request, conversation)

    async def events() -> AsyncIterator[str]:
        citations = [asdict(c) for c in context.citations]
        yield _sse(
            "meta",
            {
                "conversation_id": str(conversation.id),
                "provider": context.engine.provider_key,
                "model": context.engine.model,
                "external": context.engine.external,
                "has_context": context.has_context,
                "citations": citations,
            },
        )

        if not context.has_context:
            yield _sse("delta", {"text": INSUFFICIENT_CONTEXT_MESSAGE})
            message = _record(db, conversation, request, context, INSUFFICIENT_CONTEXT_MESSAGE, [])
            yield _sse("done", {"message_id": str(message.id)})
            return

        buffer: list[str] = []
        try:
            async for delta in rag_service.stream_answer(context):
                buffer.append(delta)
                yield _sse("delta", {"text": delta})
        except AppError as exc:
            yield _sse("error", {"code": exc.code, "message": exc.message})
            return

        answer = "".join(buffer)
        # The final citation set is only known once the answer is complete, so the
        # client reconciles what the meta event sent with what `done` carries.
        final_citations = rag_service.citations_for(context, answer)
        message = _record(db, conversation, request, context, answer, final_citations)
        yield _sse("done", {"message_id": str(message.id), "citations": final_citations})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _sse(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: uuid.UUID, db: Session = Depends(get_db)) -> dict:
    conversation = db.get(Conversation, conversation_id)
    if conversation is None:
        return {"id": str(conversation_id), "messages": []}
    return {
        "id": str(conversation.id),
        "title": conversation.title,
        "messages": [
            {
                "id": str(m.id),
                "role": m.role,
                "content": m.content,
                "provider": m.provider,
                "model": m.model,
                "citations": m.citations or [],
                "created_at": m.created_at.isoformat(),
            }
            for m in conversation.messages
        ],
    }
