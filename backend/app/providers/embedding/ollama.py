"""Embedding provider backed by Ollama's native embeddings API."""

from __future__ import annotations

import time

import httpx

from app.core.config import settings
from app.core.errors import ProviderError
from app.providers.base import EmbeddingProvider, HealthResult, ModelInfo

LABEL = "Local Embedding (Ollama)"


class OllamaEmbeddingProvider(EmbeddingProvider):
    key = "local"
    external = False

    def __init__(self, *, base_url: str, api_key: str = "") -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self.label = LABEL

    @property
    def configured(self) -> bool:
        return bool(self._base_url)

    def _client(self) -> httpx.AsyncClient:
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        return httpx.AsyncClient(
            base_url=self._base_url, headers=headers, timeout=settings.request_timeout_seconds
        )

    async def embed(self, texts: list[str], *, model: str) -> list[list[float]]:
        if not texts:
            return []
        async with self._client() as client:
            try:
                response = await client.post("/api/embed", json={"model": model, "input": texts})
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise ProviderError(_friendly(exc)) from exc
            body = response.json()
        embeddings = body.get("embeddings")
        if embeddings is None and body.get("embedding") is not None:
            embeddings = [body["embedding"]]
        if not embeddings or len(embeddings) != len(texts):
            raise ProviderError(f"{LABEL}: ผลลัพธ์ embedding ไม่ครบตามจำนวนข้อความ")
        return embeddings

    async def health_check(self) -> HealthResult:
        if not self.configured:
            return HealthResult(state="not_configured", detail="ยังไม่ได้ตั้งค่า Base URL")
        started = time.perf_counter()
        try:
            async with self._client() as client:
                response = await client.get("/api/tags", timeout=10)
                response.raise_for_status()
        except httpx.HTTPError as exc:
            return HealthResult(state="unavailable", detail=_friendly(exc))
        return HealthResult(state="available", latency_ms=int((time.perf_counter() - started) * 1000))

    async def get_models(self) -> list[ModelInfo]:
        if not self.configured:
            return []
        async with self._client() as client:
            try:
                response = await client.get("/api/tags", timeout=20)
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise ProviderError(_friendly(exc)) from exc
            body = response.json()
        return sorted(
            (ModelInfo(id=m["name"]) for m in (body.get("models") or []) if m.get("name")),
            key=lambda m: m.id,
        )


def _friendly(exc: httpx.HTTPError) -> str:
    if isinstance(exc, httpx.HTTPStatusError):
        return f"{LABEL}: บริการตอบกลับด้วยสถานะ {exc.response.status_code}"
    return f"{LABEL}: ไม่สามารถเชื่อมต่อได้"
