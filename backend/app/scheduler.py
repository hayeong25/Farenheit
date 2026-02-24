"""APScheduler-based task scheduler (replaces Celery + Redis)."""

import asyncio
import logging

from apscheduler.schedulers.background import BackgroundScheduler

from app.config import settings

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()


def _run_collect_prices() -> None:
    """Scheduled job: collect prices for all active routes."""
    logger.info("Scheduler: Starting price collection...")
    try:
        from pipeline.tasks.collect_prices import collect_all_routes_sync
        result = collect_all_routes_sync()
        logger.info(f"Scheduler: Collection complete - {result}")
    except Exception as e:
        logger.error(f"Scheduler: Collection failed - {e}")


def _run_predictions() -> None:
    """Scheduled job: run ML predictions."""
    logger.info("Scheduler: Running predictions...")
    try:
        from pipeline.tasks.run_prediction import predict_all_active_sync
        result = predict_all_active_sync()
        logger.info(f"Scheduler: Predictions complete - {result}")
    except Exception as e:
        logger.error(f"Scheduler: Predictions failed - {e}")


def start_scheduler() -> None:
    """Start the background scheduler with configured jobs."""
    # Collect prices periodically
    scheduler.add_job(
        _run_collect_prices,
        "interval",
        minutes=settings.COLLECTION_INTERVAL_MINUTES,
        id="collect_prices",
        name="Collect flight prices",
        replace_existing=True,
    )

    # Run predictions periodically
    scheduler.add_job(
        _run_predictions,
        "interval",
        minutes=settings.PREDICTION_INTERVAL_MINUTES,
        id="run_predictions",
        name="Run ML predictions",
        replace_existing=True,
    )

    scheduler.start()
    logger.info(
        f"Scheduler started: collection every {settings.COLLECTION_INTERVAL_MINUTES}min, "
        f"predictions every {settings.PREDICTION_INTERVAL_MINUTES}min"
    )


def stop_scheduler() -> None:
    """Stop the scheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
