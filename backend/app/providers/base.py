"""Provider contracts.

Business logic depends only on these abstractions. Nothing outside
`app/providers/` may import a vendor SDK or know a vendor's wire format.
"""

from __future__ import annotations

import abc
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Literal

Role = Literal["system", "user", "assistant"]
HealthState = Literal["available", "unavailable", "degraded", "checking", "not_configured"]


@dataclass(frozen=True)
class ChatMessage:
    role: Role
    content: str


@dataclass(frozen=True)
class ModelInfo:
    id: str
    label: str | None = None
    context_window: int | None = None


@dataclass(frozen=True)
class ChatResult:
    content: str
    model: str
    finish_reason: str | None = None
    usage: dict[str, int] = field(default_factory=dict)


@dataclass(frozen=True)
class HealthResult:
    state: HealthState
    detail: str | None = None
    latency_ms: int | None = None


class LLMProvider(abc.ABC):
    """A chat-completion backend."""

    #: Stable identifier used in API payloads ("local" | "openai").
    key: str
    #: Whether requests to this provider leave the local environment.
    external: bool

    @abc.abstractmethod
    async def chat(self, messages: list[ChatMessage], *, model: str, temperature: float = 0.1) -> ChatResult: ...

    @abc.abstractmethod
    def stream(
        self, messages: list[ChatMessage], *, model: str, temperature: float = 0.1
    ) -> AsyncIterator[str]: ...

    @abc.abstractmethod
    async def health_check(self) -> HealthResult: ...

    @abc.abstractmethod
    async def get_models(self) -> list[ModelInfo]: ...


class EmbeddingProvider(abc.ABC):
    """A text-embedding backend, selected independently of the LLM provider."""

    key: str
    external: bool

    @abc.abstractmethod
    async def embed(self, texts: list[str], *, model: str) -> list[list[float]]: ...

    @abc.abstractmethod
    async def health_check(self) -> HealthResult: ...

    @abc.abstractmethod
    async def get_models(self) -> list[ModelInfo]: ...


class OCRProvider(abc.ABC):
    """An OCR backend."""

    key: str
    external: bool

    @abc.abstractmethod
    async def extract(self, data: bytes, *, mime_type: str, languages: str) -> "OCRResult": ...

    @abc.abstractmethod
    async def health_check(self) -> HealthResult: ...


@dataclass(frozen=True)
class OCRPage:
    page_number: int
    text: str
    confidence: float | None = None


@dataclass(frozen=True)
class OCRResult:
    pages: list[OCRPage]
    provider: str
    confidence: float | None = None
