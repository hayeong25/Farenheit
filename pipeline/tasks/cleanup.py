"""Data cleanup task (runs without Celery)."""

import logging

logger = logging.getLogger(__name__)


def apply_retention_policy_sync() -> dict:
    """Clean up old raw data beyond retention period (sync wrapper)."""
    # TODO: Implement data retention cleanup
    logger.info("Applying data retention policy")
    return {"status": "ok", "message": "Retention policy not yet implemented"}
