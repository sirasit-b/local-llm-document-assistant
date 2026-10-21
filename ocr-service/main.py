"""Replaceable OCR microservice (Tesseract).

Contract — any engine implementing these two endpoints can replace this one:
  GET  /health -> {"status": "ok", "engine": "<name>", "languages": [...]}
  POST /ocr    -> {"engine": "<name>", "confidence": float|null,
                   "pages": [{"page_number": int, "text": str, "confidence": float|null}]}
"""

from __future__ import annotations

import io
import logging

import pytesseract
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pdf2image import convert_from_bytes
from PIL import Image

logger = logging.getLogger("ocr")

app = FastAPI(title="OCR Service", version="1.0.0")

MAX_PDF_PAGES = 100
ENGINE = "tesseract"


@app.get("/health")
def health() -> dict:
    try:
        languages = pytesseract.get_languages(config="")
        version = str(pytesseract.get_tesseract_version())
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail="tesseract unavailable") from exc
    return {"status": "ok", "engine": ENGINE, "version": version, "languages": languages}


def _ocr_image(image: Image.Image, languages: str) -> tuple[str, float | None]:
    """Return the page text and the mean word confidence.

    The text comes from `image_to_string`, which keeps Tesseract's own layout.
    Rebuilding it from `image_to_data` tokens would insert a space between every
    Thai cluster, since Thai has no word spacing; `image_to_data` is therefore
    used only to compute confidence.
    """
    text = pytesseract.image_to_string(image, lang=languages)

    confidences: list[float] = []
    data = pytesseract.image_to_data(image, lang=languages, output_type=pytesseract.Output.DICT)
    for token, conf in zip(data["text"], data["conf"], strict=False):
        if not token.strip():
            continue
        try:
            value = float(conf)
        except (TypeError, ValueError):
            continue
        if value >= 0:
            confidences.append(value / 100.0)

    average = sum(confidences) / len(confidences) if confidences else None
    return text.strip(), average


@app.post("/ocr")
async def ocr(file: UploadFile = File(...), languages: str = Form("tha+eng")) -> dict:
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=422, detail="empty file")

    content_type = (file.content_type or "").lower()
    pages: list[dict] = []

    try:
        if "pdf" in content_type:
            images = convert_from_bytes(payload, dpi=200)
            if len(images) > MAX_PDF_PAGES:
                raise HTTPException(status_code=413, detail="too many pages")
            for index, image in enumerate(images, start=1):
                text, confidence = _ocr_image(image, languages)
                pages.append({"page_number": index, "text": text, "confidence": confidence})
        else:
            image = Image.open(io.BytesIO(payload))
            text, confidence = _ocr_image(image, languages)
            pages.append({"page_number": 1, "text": text, "confidence": confidence})
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("ocr failed")
        raise HTTPException(status_code=500, detail="ocr failed") from exc

    confidences = [p["confidence"] for p in pages if p["confidence"] is not None]
    return {
        "engine": ENGINE,
        "confidence": sum(confidences) / len(confidences) if confidences else None,
        "pages": pages,
    }
