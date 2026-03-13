"""Data cleanup task - applies retention policy to old data."""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, and_, or_

from pipeline.db import session_factory as _session_factory

logger = logging.getLogger(__name__)

_PRICE_RETENTION_DAYS = 180
_STALE_PREDICTION_DAYS = 7


async def _cleanup() -> dict:
    """Remove data older than retention period."""
    from app.models.alert import PriceAlert
    from app.models.flight_price import FlightPrice
    from app.models.prediction import Prediction

    session_factory = _session_factory
    # Use tz-naive datetimes for SQLite compatibility
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    today = now.date()

    price_cutoff = now - timedelta(days=_PRICE_RETENTION_DAYS)

    async with session_factory() as session:
        price_result = await session.execute(
            delete(FlightPrice).where(FlightPrice.time < price_cutoff)
        )
        # Delete predictions for past departure dates
        stale_cutoff = now - timedelta(days=_STALE_PREDICTION_DAYS)
        pred_result = await session.execute(
            delete(Prediction).where(
                or_(
                    Prediction.departure_date < today,
                    Prediction.valid_until < stale_cutoff,
                )
            )
        )

        # Delete triggered alerts for past departure dates (no longer relevant)
        alerts_result = await session.execute(
            delete(PriceAlert).where(
                and_(
                    PriceAlert.is_triggered.is_(True),
                    PriceAlert.departure_date.isnot(None),
                    PriceAlert.departure_date < today,
                )
            )
        )

        # Capture rowcount before commit (result proxy may be invalidated after)
        prices_deleted = price_result.rowcount
        preds_deleted = pred_result.rowcount
        alerts_deleted = alerts_result.rowcount

        try:
            await session.commit()
        except Exception as e:
            logger.error(f"Failed to commit cleanup: {e}", exc_info=True)
            await session.rollback()
            return {"status": "error", "prices_deleted": 0, "predictions_deleted": 0, "alerts_deleted": 0}

    logger.info(f"Cleanup: {prices_deleted} prices, {preds_deleted} predictions, {alerts_deleted} expired alerts removed")
    return {
        "status": "ok",
        "prices_deleted": prices_deleted,
        "predictions_deleted": preds_deleted,
        "alerts_deleted": alerts_deleted,
    }


def apply_retention_policy_sync() -> dict:
    """Synchronous wrapper for APScheduler."""
    return asyncio.run(_cleanup())
