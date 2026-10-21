"""Request and response schemas. These define the public API contract."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ProviderKey = Literal["local", "openai"]


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    filename: str
    kind: str
    mime_type: str
    size_bytes: int
    page_count: int | None
    chunk_count: int
    processing_status: str
    index_status: str
    ocr_status: str
    error_message: str | None
    embedding_model: str | None
    created_at: datetime
    updated_at: datetime


class DocumentListOut(BaseModel):
    items: list[DocumentOut]
    total: int


class DocumentPageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    page_number: int
    content: str
    ocr_confidence: float | None


class DocumentPreviewOut(BaseModel):
    document: DocumentOut
    pages: list[DocumentPageOut]


class CitationOut(BaseModel):
    index: int
    document_id: str
    document_name: str
    page_number: int | None
    chunk_index: int
    score: float
    excerpt: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    provider: ProviderKey | None = None
    model: str | None = Field(default=None, max_length=128)
    conversation_id: uuid.UUID | None = None
    document_scope: list[uuid.UUID] = Field(default_factory=list, max_length=50)
    acknowledge_external: bool = False


class ChatResponse(BaseModel):
    conversation_id: uuid.UUID
    message_id: uuid.UUID
    provider: str
    model: str
    external: bool
    answer: str
    citations: list[CitationOut]
    has_context: bool


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    document_scope: list[uuid.UUID] = Field(default_factory=list, max_length=50)
    top_k: int = Field(default=6, ge=1, le=25)


class SearchHitOut(BaseModel):
    document_id: uuid.UUID
    document_name: str
    page_number: int | None
    chunk_index: int
    score: float
    content: str


class ModelOut(BaseModel):
    id: str
    label: str | None = None


class ProviderOut(BaseModel):
    key: ProviderKey
    label: str
    enabled: bool
    external: bool
    privacy_note: str
    default_model: str | None
    is_default: bool


class ProviderHealthOut(BaseModel):
    key: str
    state: str
    detail: str | None = None
    latency_ms: int | None = None


class LocalEngineOut(BaseModel):
    enabled: bool
    provider_type: str
    base_url: str
    api_key_masked: str | None
    default_model: str
    default_embedding_model: str


class OpenAIEngineOut(BaseModel):
    enabled: bool
    base_url: str
    api_key_masked: str | None
    default_model: str
    default_embedding_model: str


class SettingsOut(BaseModel):
    local: LocalEngineOut
    openai: OpenAIEngineOut
    default_llm_provider: ProviderKey
    default_embedding_provider: ProviderKey
    local_only_mode: bool


class LocalEngineIn(BaseModel):
    enabled: bool | None = None
    provider_type: Literal["ollama", "vllm", "openai_compatible"] | None = None
    base_url: str | None = Field(default=None, max_length=512)
    api_key: str | None = Field(default=None, max_length=512)
    default_model: str | None = Field(default=None, max_length=128)
    default_embedding_model: str | None = Field(default=None, max_length=128)


class OpenAIEngineIn(BaseModel):
    enabled: bool | None = None
    base_url: str | None = Field(default=None, max_length=512)
    api_key: str | None = Field(default=None, max_length=512)
    default_model: str | None = Field(default=None, max_length=128)
    default_embedding_model: str | None = Field(default=None, max_length=128)


class SettingsIn(BaseModel):
    local: LocalEngineIn | None = None
    openai: OpenAIEngineIn | None = None
    default_llm_provider: ProviderKey | None = None
    default_embedding_provider: ProviderKey | None = None
    local_only_mode: bool | None = None


class ServiceStatusOut(BaseModel):
    key: str
    state: str
    detail: str | None = None
    latency_ms: int | None = None


class SystemStatusOut(BaseModel):
    services: list[ServiceStatusOut]
    local_only_mode: bool
    app_env: str


class StatisticsOut(BaseModel):
    total_documents: int
    by_kind: list[dict]
    storage_bytes: int
    ready: int
    failed: int
    processing: int


class SourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    source_type: str
    base_url: str | None
    enabled: bool
    last_status: str | None
    last_error: str | None
    last_checked_at: datetime | None
    created_at: datetime


class SourceIn(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    source_type: Literal["database", "rest_api", "erp", "crm", "file_storage"]
    base_url: str | None = Field(default=None, max_length=512)
    config: dict | None = None


class OcrJobOut(BaseModel):
    document_id: uuid.UUID
    filename: str
    kind: str
    status: str
    confidence: float | None
    pages_processed: int
    error_message: str | None
    created_at: datetime | None
