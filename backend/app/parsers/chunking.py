"""Page-aware chunking.

Chunks never span pages so that every retrieved chunk can cite an exact page.
Splitting prefers paragraph, then sentence, then word boundaries.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.parsers.text_extraction import ParsedPage

_SENTENCE_BOUNDARY = re.compile(r"(?<=[.!?。])\s+|\n")


@dataclass(frozen=True)
class Chunk:
    index: int
    page_number: int | None
    content: str

    @property
    def token_estimate(self) -> int:
        # Rough but provider-independent: Thai and English average ~4 chars/token.
        return max(1, len(self.content) // 4)


def chunk_pages(pages: list[ParsedPage], *, size: int, overlap: int) -> list[Chunk]:
    if size <= 0:
        raise ValueError("chunk size must be positive")
    overlap = max(0, min(overlap, size - 1))

    chunks: list[Chunk] = []
    index = 0
    for page in pages:
        for body in _split(page.content, size=size, overlap=overlap):
            chunks.append(Chunk(index=index, page_number=page.page_number, content=body))
            index += 1
    return chunks


def _split(text: str, *, size: int, overlap: int) -> list[str]:
    text = text.strip()
    if not text:
        return []
    if len(text) <= size:
        return [text]

    pieces: list[str] = []
    buffer = ""
    for unit in _units(text, size):
        candidate = f"{buffer}\n{unit}".strip() if buffer else unit
        if len(candidate) <= size:
            buffer = candidate
            continue
        if buffer:
            pieces.append(buffer)
            tail = buffer[-overlap:] if overlap else ""
            carried = f"{tail}\n{unit}".strip() if tail else unit
            # Keep the overlap only when it still fits; a chunk never exceeds `size`.
            buffer = carried if len(carried) <= size else unit
        else:
            pieces.append(unit)
            buffer = ""
    if buffer:
        pieces.append(buffer)
    return [p for p in (piece.strip() for piece in pieces) if p]


def _units(text: str, size: int) -> list[str]:
    """Break text into the largest fragments that still fit a chunk."""
    units: list[str] = []
    for paragraph in (p for p in text.split("\n\n") if p.strip()):
        if len(paragraph) <= size:
            units.append(paragraph.strip())
            continue
        for sentence in (s for s in _SENTENCE_BOUNDARY.split(paragraph) if s and s.strip()):
            if len(sentence) <= size:
                units.append(sentence.strip())
            else:
                units.extend(_hard_wrap(sentence.strip(), size))
    return units


def _hard_wrap(text: str, size: int) -> list[str]:
    words = text.split(" ")
    out: list[str] = []
    buffer = ""
    for word in words:
        if len(word) > size:  # unbroken run, e.g. Thai text without spaces
            if buffer:
                out.append(buffer)
                buffer = ""
            out.extend(word[i : i + size] for i in range(0, len(word), size))
            continue
        candidate = f"{buffer} {word}".strip()
        if len(candidate) <= size:
            buffer = candidate
        else:
            out.append(buffer)
            buffer = word
    if buffer:
        out.append(buffer)
    return out
