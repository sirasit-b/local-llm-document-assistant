"""LLM provider for any server speaking the OpenAI chat-completions protocol.

Used for OpenAI itself, for vLLM, and for any other OpenAI-compatible local
server. Ollama has its own adapter because its native API differs.
"""

from __future__ import annotations

import json
import time
from collections.abc import AsyncIterator

import httpx

from app.core.config import settings
from app.core.errors import ProviderError
from app.providers.base import ChatMessage, ChatResult, HealthResult, LLMProvider, ModelInfo


class OpenAICompatibleProvider(LLMProvider):
    def __init__(
        self,
        *,
        key: str,
        base_url: str,
        api_key: str = "",
        external: bool,
        label: str = "OpenAI-compatible",
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
        # A hosted OpenAI endpoint is useless without a key; a local one may not need one.
        return bool(self._api_key) or not self.external

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        return headers

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self._base_url,
            headers=self._headers(),
            timeout=settings.request_timeout_seconds,
        )

    @staticmethod
    def _payload(messages: list[ChatMessage], model: str, temperature: float, stream: bool) -> dict:
        return {
            "model": model,
            "temperature": temperature,
            "stream": stream,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
        }

    async def chat(
        self, messages: list[ChatMessage], *, model: str, temperature: float = 0.1
    ) -> ChatResult:
        async with self._client() as client:
            try:
                response = await client.post(
                    "/chat/completions", json=self._payload(messages, model, temperature, False)
                )
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise ProviderError(_friendly(self.label, exc)) from exc
            body = response.json()
        choice = (body.get("choices") or [{}])[0]
        return ChatResult(
            content=(choice.get("message") or {}).get("content", ""),
            model=body.get("model", model),
            finish_reason=choice.get("finish_reason"),
            usage=body.get("usage") or {},
        )

    async def stream(
        self, messages: list[ChatMessage], *, model: str, temperature: float = 0.1
    ) -> AsyncIterator[str]:
        async with self._client() as client:
            try:
                async with client.stream(
                    "POST", "/chat/completions", json=self._payload(messages, model, temperature, True)
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if not data or data == "[DONE]":
                            continue
                        try:
                            chunk = json.loads(data)
                        except json.JSONDecodeError:
                            continue
                        delta = ((chunk.get("choices") or [{}])[0].get("delta") or {}).get("content")
                        if delta:
                            yield delta
            except httpx.HTTPError as exc:
                raise ProviderError(_friendly(self.label, exc)) from exc

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
        models = [
            ModelInfo(id=item["id"], label=item.get("id"))
            for item in (items or [])
            if isinstance(item, dict) and item.get("id")
        ]
        return sorted(models, key=lambda m: m.id)


def _friendly(label: str, exc: httpx.HTTPError) -> str:
    if isinstance(exc, httpx.HTTPStatusError):
        if exc.response.status_code in (401, 403):
            return f"{label}: การยืนยันตัวตนไม่ถูกต้อง"
        if exc.response.status_code == 404:
            return f"{label}: ไม่พบโมเดลหรือปลายทางที่ระบุ"
        if exc.response.status_code == 429:
            return f"{label}: โควตาหมดหรือถูกจำกัดอัตราการเรียกใช้ (429)"
        return f"{label}: บริการตอบกลับด้วยสถานะ {exc.response.status_code}"
    return f"{label}: ไม่สามารถเชื่อมต่อได้"
