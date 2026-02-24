"""Price collection task (runs without Celery)."""

import asyncio
import logging
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from pipeline.collectors.amadeus_collector import AmadeusCollector
from pipeline.collectors.base import PriceObservation
from pipeline.config import pipeline_settings

logger = logging.getLogger(__name__)


def _get_session_factory() -> async_sessionmaker[AsyncSession]:
    engine = create_async_engine(pipeline_settings.DATABASE_URL)
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def _collect_route(
    collector: AmadeusCollector,
    origin: str,
    destination: str,
    departure_dates: list[date],
) -> list[PriceObservation]:
    """Collect prices for a single route across multiple departure dates."""
    all_observations: list[PriceObservation] = []

    for dep_date in departure_dates:
        try:
            observations = await collector.collect(origin, destination, dep_date)
            all_observations.extend(observations)
            logger.info(
                f"Collected {len(observations)} prices for {origin}->{destination} on {dep_date}"
            )
        except Exception as e:
            logger.error(f"Failed to collect {origin}->{destination} on {dep_date}: {e}")

    return all_observations


async def _store_observations(
    session_factory: async_sessionmaker[AsyncSession],
    observations: list[PriceObservation],
) -> int:
    """Store price observations in the database."""
    import sys
    from pathlib import Path

    # Ensure backend is importable
    project_root = Path(__file__).parent.parent.parent
    if str(project_root / "backend") not in sys.path:
        sys.path.insert(0, str(project_root / "backend"))

    from app.models.flight_price import FlightPrice
    from app.models.route import Route

    stored = 0
    async with session_factory() as session:
        for obs in observations:
            result = await session.execute(
                select(Route).where(
                    Route.origin_code == obs.origin,
                    Route.dest_code == obs.destination,
                )
            )
            route = result.scalar_one_or_none()
            if not route:
                continue

            price = FlightPrice(
                time=obs.observed_at,
                route_id=route.id,
                airline_code=obs.airline_code,
                departure_date=obs.departure_date,
                cabin_class=obs.cabin_class,
                return_date=obs.return_date,
                price_amount=obs.price,
                currency=obs.currency,
                stops=obs.stops,
                duration_minutes=obs.duration_minutes,
                source=obs.source,
                raw_offer_id=obs.raw_offer_id,
            )
            session.add(price)
            stored += 1

        await session.commit()

    return stored


async def collect_all_routes_async() -> dict:
    """Main collection logic (async)."""
    import sys
    from pathlib import Path

    project_root = Path(__file__).parent.parent.parent
    if str(project_root / "backend") not in sys.path:
        sys.path.insert(0, str(project_root / "backend"))

    from app.models.route import Route

    session_factory = _get_session_factory()
    collector = AmadeusCollector()

    # Get active routes
    async with session_factory() as session:
        result = await session.execute(select(Route).where(Route.is_active.is_(True)))
        routes = result.scalars().all()

    if not routes:
        logger.info("No active routes to collect")
        return {"status": "ok", "routes": 0, "observations": 0}

    # Generate departure dates:
    # - Next 30 days: every 3 days (dense near-term data for accuracy)
    # - 30-60 days out: every 5 days
    # - 60-90 days out: weekly
    today = date.today()
    departure_dates = (
        [today + timedelta(days=d) for d in range(7, 31, 3)]
        + [today + timedelta(days=d) for d in range(30, 61, 5)]
        + [today + timedelta(days=d) for d in range(63, 91, 7)]
    )

    all_observations: list[PriceObservation] = []
    for route in routes:
        observations = await _collect_route(
            collector, route.origin_code, route.dest_code, departure_dates
        )
        all_observations.extend(observations)

    # Store in database
    stored = await _store_observations(session_factory, all_observations)

    logger.info(f"Collection complete: {len(routes)} routes, {stored} observations stored")
    return {
        "status": "ok",
        "routes": len(routes),
        "observations": stored,
    }


def collect_all_routes_sync() -> dict:
    """Synchronous wrapper for APScheduler."""
    return asyncio.run(collect_all_routes_async())
