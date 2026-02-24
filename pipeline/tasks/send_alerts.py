import logging

from pipeline.celery_app import app

logger = logging.getLogger(__name__)


@app.task(name="pipeline.tasks.send_alerts.check_and_send")
def check_and_send():
    """Check price alerts and send notifications when triggered."""
    # TODO: Implement alert checking and notification sending
    logger.info("Checking price alerts")
    return {"status": "ok", "message": "Alert system not yet implemented"}
