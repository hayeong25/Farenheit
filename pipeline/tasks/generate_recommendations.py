import logging

from pipeline.celery_app import app

logger = logging.getLogger(__name__)


@app.task(name="pipeline.tasks.generate_recommendations.generate_all")
def generate_all():
    """Generate BUY/WAIT/HOLD recommendations based on latest predictions."""
    # TODO: Implement recommendation generation
    logger.info("Generating recommendations for all active routes")
    return {"status": "ok", "message": "Recommendation generation not yet implemented"}
