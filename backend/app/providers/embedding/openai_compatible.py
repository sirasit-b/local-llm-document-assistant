"""Embedding provider for OpenAI and OpenAI-compatible servers."""

from __future__ import annotations

import time

import httpx

from app.core.config import settings
from app.core.errors import ProviderError
from app.providers.base import EmbeddingProvider, HealthResult, ModelInfo


class OpenAICompatibleEmbeddingProvider(EmbeddingProvider):
    def __init__(
        self, *, key: str, base_url: str, api_key: str = "", external: bool, label: str
    ) -> None:
        self.key = key
        self.external = external
        self.label = label
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key

    @property
    def configured(self) -> bool:
        if not self._base_url:
            return False
        return bool(self._api_key) or not self.external

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
                response = await client.post("/embeddings", json={"model": model, "input": texts})
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise ProviderError(_friendly(self.label, exc)) from exc
            body = response.json()
        items = sorted(body.get("data") or [], key=lambda d: d.get("index", 0))
        return [item["embedding"] for item in items]

    async def health_check(self) -> HealthResult:
        if not self.configured:
            return HealthResult(state="not_configured", detail="ยังไม่ได้ตั้งค่า")
        started = time.perf_counter()
        try:
            async with self._client() as client:
                response = await client.get("/models", timeout=10)
                response.raise_for_status()
        except httpx.HTTPError as exc:
            return HealthResult(state="unavailable", detail=_friendly(self.label, exc))
        return HealthResult(state="available", latency_ms=int((time.perf_counter() - started) * 1000))

    async def get_models(self) -> list[ModelInfo]:
        if not self.configured:
            return []
        async with self._client() as client:
            try:
                response = await client.get("/models", timeout=20)
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise ProviderError(_friendly(self.label, exc)) from exc
            body = response.json()
        items = body.get("data") if isinstance(body, dict) else body
        return sorted(
            (ModelInfo(id=i["id"]) for i in (items or []) if isinstance(i, dict) and i.get("id")),
            key=lambda m: m.id,
        )


def _friendly(label: str, exc: httpx.HTTPError) -> str:
    if isinstance(exc, httpx.HTTPStatusError):
        if exc.response.status_code in (401, 403):
            return f"{label}: การยืนยันตัวตนไม่ถูกต้อง"
        if exc.response.status_code == 429:
            return f"{label}: โควตาหมดหรือถูกจำกัดอัตราการเรียกใช้ (429)"
        return f"{label}: บริการตอบกลับด้วยสถานะ {exc.response.status_code}"
    return f"{label}: ไม่สามารถเชื่อมต่อได้"
