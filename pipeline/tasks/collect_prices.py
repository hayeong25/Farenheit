"""Price collection task (runs without Celery)."""

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from pipeline.collectors.amadeus_collector import AmadeusCollector
from pipeline.collectors.base import PriceObservation
from pipeline.db import session_factory as _session_factory

logger = logging.getLogger(__name__)


async def _collect_route(
    collector: AmadeusCollector,
    origin: str,
    destination: str,
    departure_dates: list[date],
) -> list[PriceObservation]:
    """Collect prices for a single route across multiple departure dates."""
    all_observations: list[PriceObservation] = []

    for i, dep_date in enumerate(departure_dates):
        try:
            observations = await collector.collect(origin, destination, dep_date)
            all_observations.extend(observations)
            logger.info(
                f"Collected {len(observations)} prices for {origin}->{destination} on {dep_date}"
            )
        except Exception as e:
            logger.error(f"Failed to collect {origin}->{destination} on {dep_date}: {e}", exc_info=True)
        # Rate limit between departure date API calls
        if i < len(departure_dates) - 1:
            await asyncio.sleep(0.3)

    return all_observations


async def _store_observations(
    session_factory: async_sessionmaker[AsyncSession],
    observations: list[PriceObservation],
) -> int:
    """Store price observations in the database."""
    from app.models.airline import Airline
    from app.models.flight_price import FlightPrice
    from app.models.route import Route

    stored = 0
    skipped_airline = 0
    skipped_route = 0
    async with session_factory() as session:
        # Pre-fetch valid airline codes to avoid FK violations
        airline_result = await session.execute(select(Airline.iata_code))
        valid_airlines = {row[0] for row in airline_result.all()}

        # Pre-fetch all routes into a lookup dict to avoid N+1 queries
        route_result = await session.execute(select(Route))
        route_lookup: dict[tuple[str, str], Route] = {
            (r.origin_code, r.dest_code): r for r in route_result.scalars().all()
        }

        for obs in observations:
            # Skip if airline code is missing or not in our airlines table
            if not obs.airline_code or obs.airline_code not in valid_airlines:
                skipped_airline += 1
                continue

            route = route_lookup.get((obs.origin, obs.destination))
            if not route:
                skipped_route += 1
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

        if skipped_airline > 0:
            logger.info(f"Skipped {skipped_airline} observations with unknown airline codes")
        if skipped_route > 0:
            logger.info(f"Skipped {skipped_route} observations with missing routes")

        try:
            await session.commit()
        except Exception as e:
            logger.error(f"Failed to commit {stored} observations: {e}", exc_info=True)
            await session.rollback()
            return 0

    return stored


async def collect_all_routes_async() -> dict:
    """Main collection logic (async)."""
    from app.models.route import Route

    session_factory = _session_factory
    collector = AmadeusCollector()

    # Get active routes
    async with session_factory() as session:
        result = await session.execute(select(Route).where(Route.is_active.is_(True)))
        routes = result.scalars().all()

    if not routes:
        logger.info("No active routes to collect")
        return {"status": "ok", "routes": 0, "observations": 0}

    # Generate departure dates (deduplicated, sorted):
    # - 7-30 days: every 3 days (dense near-term data for accuracy)
    # - 31-60 days out: every 5 days
    # - 61-90 days out: weekly
    today = datetime.now(timezone.utc).date()
    date_set = set()
    date_set.update(today + timedelta(days=d) for d in range(7, 31, 3))
    date_set.update(today + timedelta(days=d) for d in range(31, 61, 5))
    date_set.update(today + timedelta(days=d) for d in range(61, 91, 7))
    departure_dates = sorted(date_set)

    all_observations: list[PriceObservation] = []
    for i, route in enumerate(routes):
        observations = await _collect_route(
            collector, route.origin_code, route.dest_code, departure_dates
        )
        all_observations.extend(observations)
        # Rate limit between routes
        if i < len(routes) - 1:
            await asyncio.sleep(0.5)

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
