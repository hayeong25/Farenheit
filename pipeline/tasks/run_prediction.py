"""Prediction task (runs without Celery)."""

import logging

logger = logging.getLogger(__name__)


def predict_all_active_sync() -> dict:
    """Run prediction models for all active routes (sync wrapper)."""
    # TODO: Implement with ML models
    logger.info("Running predictions for all active routes")
    return {"status": "ok", "message": "Prediction pipeline not yet implemented"}


def retrain_models_sync() -> dict:
    """Retrain ML models with latest data (sync wrapper)."""
    # TODO: Implement model retraining
    logger.info("Retraining ML models")
    return {"status": "ok", "message": "Model retraining not yet implemented"}
