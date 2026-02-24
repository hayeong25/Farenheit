"""Alert notification task - checks price alerts against current prices."""

import asyncio
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from pipeline.config import pipeline_settings

logger = logging.getLogger(__name__)

_project_root = Path(__file__).parent.parent.parent
if str(_project_root / "backend") not in sys.path:
    sys.path.insert(0, str(_project_root / "backend"))


def _get_session_factory() -> async_sessionmaker[AsyncSession]:
    engine = create_async_engine(pipeline_settings.DATABASE_URL)
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def _check_alerts() -> dict:
    """Check all active alerts against latest prices."""
    from app.models.alert import PriceAlert
    from app.models.flight_price import FlightPrice

    session_factory = _get_session_factory()
    triggered = 0

    async with session_factory() as session:
        # Get all un-triggered alerts
        result = await session.execute(
            select(PriceAlert).where(PriceAlert.is_triggered.is_(False))
        )
        alerts = result.scalars().all()

        for alert in alerts:
            # Get the latest minimum price for this route
            price_result = await session.execute(
                select(func.min(FlightPrice.price_amount)).where(
                    FlightPrice.route_id == alert.route_id,
                    FlightPrice.cabin_class == alert.cabin_class,
                )
            )
            min_price = price_result.scalar()

            if min_price is not None and min_price <= alert.target_price:
                alert.is_triggered = True
                alert.triggered_at = datetime.now(timezone.utc)
                triggered += 1
                logger.info(
                    f"Alert {alert.id} triggered: route={alert.route_id}, "
                    f"target={alert.target_price}, actual={min_price}"
                )

        await session.commit()

    logger.info(f"Alert check: {len(alerts)} checked, {triggered} triggered")
    return {"status": "ok", "checked": len(alerts), "triggered": triggered}


def check_and_send_sync() -> dict:
    """Synchronous wrapper for APScheduler."""
    return asyncio.run(_check_alerts())
