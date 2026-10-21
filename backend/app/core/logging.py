"""Logging setup that redacts anything resembling a secret."""

from __future__ import annotations

import logging
import re

from app.core.config import settings

_SECRET_PATTERNS = [
    re.compile(r"sk-[A-Za-z0-9_\-]{8,}"),
    re.compile(r"(?i)(api[_-]?key\"?\s*[:=]\s*\"?)([^\s\",}]+)"),
    re.compile(r"(?i)(authorization:\s*bearer\s+)(\S+)"),
]


class RedactingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = redact(record.msg)
        if record.args:
            record.args = tuple(
                redact(a) if isinstance(a, str) else a for a in _as_tuple(record.args)
            )
        return True


def _as_tuple(args) -> tuple:
    return args if isinstance(args, tuple) else (args,)


def redact(text: str) -> str:
    out = _SECRET_PATTERNS[0].sub("sk-***", text)
    out = _SECRET_PATTERNS[1].sub(r"\1***", out)
    out = _SECRET_PATTERNS[2].sub(r"\1***", out)
    return out


def configure_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s :: %(message)s"))
    handler.addFilter(RedactingFilter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(settings.log_level.upper())
