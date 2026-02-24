"""Recommendation generation task (runs without Celery)."""

import logging

logger = logging.getLogger(__name__)


def generate_all_sync() -> dict:
    """Generate BUY/WAIT/HOLD recommendations (sync wrapper)."""
    # TODO: Implement recommendation generation
    logger.info("Generating recommendations for all active routes")
    return {"status": "ok", "message": "Recommendation generation not yet implemented"}
