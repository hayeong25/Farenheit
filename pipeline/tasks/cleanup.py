"""Data cleanup task - applies retention policy to old data."""

import asyncio
import logging
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import delete, and_, or_

from pipeline.db import session_factory as _session_factory

logger = logging.getLogger(__name__)

_project_root = Path(__file__).parent.parent.parent
if str(_project_root / "backend") not in sys.path:
    sys.path.insert(0, str(_project_root / "backend"))


async def _cleanup() -> dict:
    """Remove data older than retention period."""
    from app.models.alert import PriceAlert
    from app.models.flight_price import FlightPrice
    from app.models.prediction import Prediction

    session_factory = _session_factory
    now = datetime.now(timezone.utc)
    today = now.date()

    # Keep 180 days of price data
    price_cutoff = now - timedelta(days=180)

    async with session_factory() as session:
        price_result = await session.execute(
            delete(FlightPrice).where(FlightPrice.time < price_cutoff)
        )
        # Delete predictions for past departure dates
        # Also purge stale predictions (valid_until expired > 7 days ago)
        stale_cutoff = now - timedelta(days=7)
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
            logger.error(f"Failed to commit cleanup: {e}")
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
