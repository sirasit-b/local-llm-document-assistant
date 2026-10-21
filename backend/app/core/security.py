"""Upload validation, filename sanitisation and secret masking.

Authentication is intentionally stubbed behind `get_current_principal` so that a
real identity provider can be dropped in without touching any route.
"""

from __future__ import annotations

import hashlib
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from app.core.config import settings
from app.core.errors import ValidationError

ALLOWED_EXTENSIONS: dict[str, set[str]] = {
    "application/pdf": {".pdf"},
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {".docx"},
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {".xlsx"},
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": {".pptx"},
    "text/plain": {".txt", ".md"},
    "text/csv": {".csv"},
    "image/jpeg": {".jpg", ".jpeg"},
    "image/png": {".png"},
}

EXTENSION_TO_KIND = {
    ".pdf": "pdf",
    ".docx": "docx",
    ".xlsx": "xlsx",
    ".pptx": "pptx",
    ".txt": "txt",
    ".md": "txt",
    ".csv": "csv",
    ".jpg": "image",
    ".jpeg": "image",
    ".png": "image",
}

_SAFE_NAME = re.compile(r"[^\w\-. ()฀-๿]+", re.UNICODE)


@dataclass(frozen=True)
class Principal:
    """Placeholder identity. Swap for a real auth dependency later."""

    subject: str = "local-user"
    roles: tuple[str, ...] = ("admin",)

    def has_role(self, role: str) -> bool:
        return role in self.roles


def get_current_principal() -> Principal:
    return Principal()


def sanitize_filename(name: str) -> str:
    base = Path(name.replace("\\", "/")).name
    base = unicodedata.normalize("NFC", base)
    base = _SAFE_NAME.sub("_", base).strip(" ._")
    if not base:
        raise ValidationError("ชื่อไฟล์ไม่ถูกต้อง")
    return base[:200]


def validate_upload(filename: str, size: int) -> tuple[str, str]:
    """Return (sanitised filename, document kind) or raise ValidationError."""
    safe = sanitize_filename(filename)
    ext = Path(safe).suffix.lower()
    if ext not in EXTENSION_TO_KIND:
        raise ValidationError(f"ไม่รองรับไฟล์ประเภท {ext or 'ไม่ทราบ'}")
    if size <= 0:
        raise ValidationError("ไฟล์ว่าง")
    if size > settings.max_upload_bytes:
        raise ValidationError(f"ไฟล์ใหญ่เกิน {settings.max_upload_mb} MB")
    return safe, EXTENSION_TO_KIND[ext]


def checksum(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def mask_secret(value: str | None) -> str | None:
    """Mask a stored secret for display. Never returns the original value."""
    if not value:
        return None
    return "•" * 16
