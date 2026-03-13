"""Alert notification task - checks price alerts against current prices."""

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select, func, or_

from pipeline.db import session_factory as _session_factory

logger = logging.getLogger(__name__)

_ALERT_RECENT_HOURS = 48


async def _check_alerts() -> dict:
    """Check all active alerts against latest prices."""
    from app.models.alert import PriceAlert
    from app.models.flight_price import FlightPrice

    session_factory = _session_factory
    triggered = 0
    # Use tz-naive for SQLite compatibility
    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    today = now_naive.date()

    async with session_factory() as session:
        # Get all un-triggered alerts (only for future or unset departure dates)
        result = await session.execute(
            select(PriceAlert).where(
                PriceAlert.is_triggered.is_(False),
                or_(
                    PriceAlert.departure_date.is_(None),
                    PriceAlert.departure_date >= today,
                ),
            )
        )
        alerts = result.scalars().all()

        # Batch: pre-fetch minimum prices for all relevant route+cabin combinations
        min_prices_map: dict[tuple[int, str, date | None], Decimal] = {}

        if alerts:
            route_cabin_pairs = list({(a.route_id, a.cabin_class) for a in alerts})
            # Only consider prices from the last N hours for alert triggering
            recent_cutoff = now_naive - timedelta(hours=_ALERT_RECENT_HOURS)

            for route_id, cabin_class in route_cabin_pairs:
                # Get min price per departure_date for this route+cabin (recent only)
                # Overall min (for alerts without departure_date) is derived from the same data
                price_result = await session.execute(
                    select(
                        FlightPrice.departure_date,
                        func.min(FlightPrice.price_amount).label("min_price"),
                    ).where(
                        FlightPrice.route_id == route_id,
                        FlightPrice.cabin_class == cabin_class,
                        FlightPrice.time >= recent_cutoff,
                    ).group_by(FlightPrice.departure_date)
                )
                overall_min = None
                for row in price_result.all():
                    min_prices_map[(route_id, cabin_class, row.departure_date)] = row.min_price
                    if overall_min is None or row.min_price < overall_min:
                        overall_min = row.min_price
                if overall_min is not None:
                    min_prices_map[(route_id, cabin_class, None)] = overall_min

        for alert in alerts:
            if alert.departure_date is not None:
                min_price = min_prices_map.get((alert.route_id, alert.cabin_class, alert.departure_date))
            else:
                min_price = min_prices_map.get((alert.route_id, alert.cabin_class, None))

            if min_price is None:
                logger.debug(
                    f"Alert {alert.id}: no price data for route={alert.route_id}, "
                    f"cabin={alert.cabin_class}, departure={alert.departure_date}"
                )
                continue

            if min_price <= alert.target_price:
                alert.is_triggered = True
                alert.triggered_at = now_naive
                triggered += 1
                logger.info(
                    f"Alert {alert.id} triggered: route={alert.route_id}, "
                    f"target={alert.target_price}, actual={min_price}"
                )

        try:
            await session.commit()
        except Exception as e:
            logger.error(f"Failed to commit alert updates: {e}", exc_info=True)
            await session.rollback()
            return {"status": "error", "checked": len(alerts), "triggered": 0}

    logger.info(f"Alert check: {len(alerts)} checked, {triggered} triggered")
    return {"status": "ok", "checked": len(alerts), "triggered": triggered}


def check_and_send_sync() -> dict:
    """Synchronous wrapper for APScheduler."""
    return asyncio.run(_check_alerts())
