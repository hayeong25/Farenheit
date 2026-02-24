"""Alert notification task (runs without Celery)."""

import logging

logger = logging.getLogger(__name__)


def check_and_send_sync() -> dict:
    """Check price alerts and send notifications (sync wrapper)."""
    # TODO: Implement alert checking and notification sending
    logger.info("Checking price alerts")
    return {"status": "ok", "message": "Alert system not yet implemented"}
