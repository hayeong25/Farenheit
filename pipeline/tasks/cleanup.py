import logging

from pipeline.celery_app import app

logger = logging.getLogger(__name__)


@app.task(name="pipeline.tasks.cleanup.apply_retention_policy")
def apply_retention_policy():
    """Clean up old raw data beyond retention period (90 days)."""
    # TODO: Implement data retention cleanup
    logger.info("Applying data retention policy")
    return {"status": "ok", "message": "Retention policy not yet implemented"}
