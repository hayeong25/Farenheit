"""APScheduler-based task scheduler (replaces Celery + Redis)."""

import logging
import time

from apscheduler.schedulers.background import BackgroundScheduler

from app.config import settings

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()


def _run_collect_prices() -> None:
    """Scheduled job: collect prices for all active routes."""
    logger.info("Scheduler: Starting price collection...")
    start = time.monotonic()
    try:
        from pipeline.tasks.collect_prices import collect_all_routes_sync
        result = collect_all_routes_sync()
        elapsed = time.monotonic() - start
        logger.info(f"Scheduler: Collection complete in {elapsed:.1f}s - {result}")
        if elapsed > 300:
            logger.warning(f"Scheduler: Collection took {elapsed:.0f}s (>5min)")
    except Exception as e:
        elapsed = time.monotonic() - start
        logger.error(f"Scheduler: Collection failed after {elapsed:.1f}s - {e}")


def _run_predictions() -> None:
    """Scheduled job: run ML predictions, then generate recommendations and check alerts."""
    logger.info("Scheduler: Running predictions...")
    start = time.monotonic()
    try:
        from pipeline.tasks.run_prediction import predict_all_active_sync
        result = predict_all_active_sync()
        elapsed = time.monotonic() - start
        logger.info(f"Scheduler: Predictions complete in {elapsed:.1f}s - {result}")
    except Exception as e:
        elapsed = time.monotonic() - start
        logger.error(f"Scheduler: Predictions failed after {elapsed:.1f}s - {e}")

    # Check alerts after predictions
    alert_start = time.monotonic()
    try:
        from pipeline.tasks.send_alerts import check_and_send_sync
        alert_result = check_and_send_sync()
        alert_elapsed = time.monotonic() - alert_start
        logger.info(f"Scheduler: Alerts checked in {alert_elapsed:.1f}s - {alert_result}")
    except Exception as e:
        alert_elapsed = time.monotonic() - alert_start
        logger.error(f"Scheduler: Alert check failed after {alert_elapsed:.1f}s - {e}")


def _run_cleanup() -> None:
    """Scheduled job: clean up old data."""
    start = time.monotonic()
    try:
        from pipeline.tasks.cleanup import apply_retention_policy_sync
        result = apply_retention_policy_sync()
        elapsed = time.monotonic() - start
        logger.info(f"Scheduler: Cleanup complete in {elapsed:.1f}s - {result}")
    except Exception as e:
        elapsed = time.monotonic() - start
        logger.error(f"Scheduler: Cleanup failed after {elapsed:.1f}s - {e}")


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
        max_instances=1,
        misfire_grace_time=300,  # Skip if > 5min late
    )

    # Run predictions periodically
    scheduler.add_job(
        _run_predictions,
        "interval",
        minutes=settings.PREDICTION_INTERVAL_MINUTES,
        id="run_predictions",
        name="Run ML predictions + alerts",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=300,
    )

    # Daily cleanup at 4 AM
    scheduler.add_job(
        _run_cleanup,
        "cron",
        hour=4,
        id="cleanup",
        name="Data cleanup",
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
