"""LLM provider for Ollama's native API."""

from __future__ import annotations

import json
import time
from collections.abc import AsyncIterator

import httpx

from app.core.config import settings
from app.core.errors import ProviderError
from app.providers.base import ChatMessage, ChatResult, HealthResult, LLMProvider, ModelInfo

LABEL = "Local AI (Ollama)"


class OllamaProvider(LLMProvider):
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

    @staticmethod
    def _payload(messages: list[ChatMessage], model: str, temperature: float, stream: bool) -> dict:
        return {
            "model": model,
            "stream": stream,
            "options": {"temperature": temperature},
            "messages": [{"role": m.role, "content": m.content} for m in messages],
        }

    async def chat(
        self, messages: list[ChatMessage], *, model: str, temperature: float = 0.1
    ) -> ChatResult:
        async with self._client() as client:
            try:
                response = await client.post(
                    "/api/chat", json=self._payload(messages, model, temperature, False)
                )
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise ProviderError(_friendly(exc)) from exc
            body = response.json()
        return ChatResult(
            content=(body.get("message") or {}).get("content", ""),
            model=body.get("model", model),
            finish_reason=body.get("done_reason"),
            usage={
                "prompt_tokens": body.get("prompt_eval_count", 0),
                "completion_tokens": body.get("eval_count", 0),
            },
        )

    async def stream(
        self, messages: list[ChatMessage], *, model: str, temperature: float = 0.1
    ) -> AsyncIterator[str]:
        async with self._client() as client:
            try:
                async with client.stream(
                    "POST", "/api/chat", json=self._payload(messages, model, temperature, True)
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            chunk = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        delta = (chunk.get("message") or {}).get("content")
                        if delta:
                            yield delta
            except httpx.HTTPError as exc:
                raise ProviderError(_friendly(exc)) from exc

    async def health_check(self) -> HealthResult:
        if not self.configured:
            return HealthResult(state="not_configured", detail="ยังไม่ได้ตั้งค่า Base URL")
        started = time.perf_counter()
        try:
            async with self._client() as client:
                response = await client.get("/api/tags", timeout=10)
                response.raise_for_status()
                models = response.json().get("models") or []
        except httpx.HTTPError as exc:
            return HealthResult(state="unavailable", detail=_friendly(exc))
        latency = int((time.perf_counter() - started) * 1000)
        if not models:
            return HealthResult(
                state="degraded", detail="เชื่อมต่อได้ แต่ยังไม่มีโมเดลในเซิร์ฟเวอร์", latency_ms=latency
            )
        return HealthResult(state="available", latency_ms=latency)

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
        models = [
            ModelInfo(id=item["name"], label=item.get("name"))
            for item in (body.get("models") or [])
            if item.get("name")
        ]
        return sorted(models, key=lambda m: m.id)


def _friendly(exc: httpx.HTTPError) -> str:
    if isinstance(exc, httpx.HTTPStatusError):
        if exc.response.status_code == 404:
            return f"{LABEL}: ไม่พบโมเดลที่ระบุบนเซิร์ฟเวอร์"
        return f"{LABEL}: บริการตอบกลับด้วยสถานะ {exc.response.status_code}"
    return f"{LABEL}: ไม่สามารถเชื่อมต่อได้"
