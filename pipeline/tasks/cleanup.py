"""Data cleanup task - applies retention policy to old data."""

import asyncio
import logging
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from pipeline.config import pipeline_settings

logger = logging.getLogger(__name__)

_project_root = Path(__file__).parent.parent.parent
if str(_project_root / "backend") not in sys.path:
    sys.path.insert(0, str(_project_root / "backend"))


def _get_session_factory() -> async_sessionmaker[AsyncSession]:
    engine = create_async_engine(pipeline_settings.DATABASE_URL)
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def _cleanup() -> dict:
    """Remove data older than retention period."""
    from app.models.flight_price import FlightPrice
    from app.models.prediction import Prediction

    session_factory = _get_session_factory()

    # Keep 180 days of price data, 30 days of predictions
    price_cutoff = datetime.now(timezone.utc) - timedelta(days=180)
    prediction_cutoff = datetime.now(timezone.utc) - timedelta(days=30)

    async with session_factory() as session:
        price_result = await session.execute(
            delete(FlightPrice).where(FlightPrice.time < price_cutoff)
        )
        pred_result = await session.execute(
            delete(Prediction).where(Prediction.predicted_at < prediction_cutoff)
        )
        await session.commit()

        prices_deleted = price_result.rowcount
        preds_deleted = pred_result.rowcount

    logger.info(f"Cleanup: {prices_deleted} prices, {preds_deleted} predictions removed")
    return {
        "status": "ok",
        "prices_deleted": prices_deleted,
        "predictions_deleted": preds_deleted,
    }


def apply_retention_policy_sync() -> dict:
    """Synchronous wrapper for APScheduler."""
    return asyncio.run(_cleanup())
