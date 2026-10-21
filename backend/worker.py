"""Document processing worker.

Polls for pending documents and runs the ingestion pipeline. Runs as its own
container so uploads stay responsive and processing can scale separately.
"""

from __future__ import annotations

import asyncio
import logging
import signal

from app.core.logging import configure_logging
from app.db.session import SessionLocal, init_db
from app.services import document_service

logger = logging.getLogger("worker")

IDLE_SLEEP_SECONDS = 2.0

_stop = asyncio.Event()


async def _run() -> None:
    init_db()
    logger.info("document worker started")
    while not _stop.is_set():
        db = SessionLocal()
        try:
            document = document_service.claim_next_pending(db)
            if document is None:
                await asyncio.sleep(IDLE_SLEEP_SECONDS)
                continue
            logger.info("processing document %s (%s)", document.id, document.filename)
            await document_service.process_document(db, document)
        except Exception:  # noqa: BLE001 - the loop must survive any single failure
            logger.exception("worker iteration failed")
            await asyncio.sleep(IDLE_SLEEP_SECONDS)
        finally:
            db.close()
    logger.info("document worker stopped")


def main() -> None:
    configure_logging()
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    def _handle_stop(*_: object) -> None:
        loop.call_soon_threadsafe(_stop.set)

    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            signal.signal(sig, _handle_stop)
        except (ValueError, OSError):  # not available on every platform
            pass

    loop.run_until_complete(_run())


if __name__ == "__main__":
    main()
