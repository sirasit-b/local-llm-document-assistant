"""OCR provider that talks to the replaceable OCR microservice over HTTP.

Swapping OCR engines means pointing OCR_BASE_URL at a different service that
implements the same two endpoints (`GET /health`, `POST /ocr`).
"""

from __future__ import annotations

import time

import httpx

from app.core.config import settings
from app.core.errors import ProviderError
from app.providers.base import HealthResult, OCRPage, OCRProvider, OCRResult

LABEL = "OCR Service"


class HttpOcrProvider(OCRProvider):
    key = "http"
    external = False

    def __init__(self, *, base_url: str) -> None:
        self._base_url = base_url.rstrip("/")

    @property
    def configured(self) -> bool:
        return bool(self._base_url)

    async def extract(self, data: bytes, *, mime_type: str, languages: str) -> OCRResult:
        if not self.configured:
            raise ProviderError("ยังไม่ได้ตั้งค่า OCR Service")
        async with httpx.AsyncClient(
            base_url=self._base_url, timeout=settings.request_timeout_seconds
        ) as client:
            try:
                response = await client.post(
                    "/ocr",
                    files={"file": ("upload", data, mime_type)},
                    data={"languages": languages},
                )
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise ProviderError(_friendly(exc)) from exc
            body = response.json()
        pages = [
            OCRPage(
                page_number=p.get("page_number", i + 1),
                text=p.get("text", ""),
                confidence=p.get("confidence"),
            )
            for i, p in enumerate(body.get("pages") or [])
        ]
        return OCRResult(pages=pages, provider=body.get("engine", "unknown"), confidence=body.get("confidence"))

    async def health_check(self) -> HealthResult:
        if not self.configured:
            return HealthResult(state="not_configured", detail="ยังไม่ได้ตั้งค่า OCR Service")
        started = time.perf_counter()
        try:
            async with httpx.AsyncClient(base_url=self._base_url, timeout=10) as client:
                response = await client.get("/health")
                response.raise_for_status()
        except httpx.HTTPError as exc:
            return HealthResult(state="unavailable", detail=_friendly(exc))
        return HealthResult(state="available", latency_ms=int((time.perf_counter() - started) * 1000))


def _friendly(exc: httpx.HTTPError) -> str:
    if isinstance(exc, httpx.HTTPStatusError):
        return f"{LABEL}: บริการตอบกลับด้วยสถานะ {exc.response.status_code}"
    return f"{LABEL}: ไม่สามารถเชื่อมต่อได้"
