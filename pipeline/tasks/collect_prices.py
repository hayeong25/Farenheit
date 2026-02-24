import asyncio
import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from pipeline.celery_app import app
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
    # Import here to avoid circular dependency
    from backend.app.models.flight_price import FlightPrice
    from backend.app.models.route import Route

    stored = 0
    async with session_factory() as session:
        for obs in observations:
            # Find or skip route
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


async def _collect_all_routes_async() -> dict:
    """Main collection logic (async)."""
    from backend.app.models.route import Route

    session_factory = _get_session_factory()
    collector = AmadeusCollector()

    # Get active routes
    async with session_factory() as session:
        result = await session.execute(select(Route).where(Route.is_active.is_(True)))
        routes = result.scalars().all()

    if not routes:
        logger.info("No active routes to collect")
        return {"status": "ok", "routes": 0, "observations": 0}

    # Generate departure dates (next 7 to 90 days)
    today = date.today()
    departure_dates = [today + timedelta(days=d) for d in range(7, 91, 7)]

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


@app.task(name="pipeline.tasks.collect_prices.collect_all_routes", bind=True, max_retries=3)
def collect_all_routes(self):
    """Celery task: Collect prices for all active routes."""
    try:
        result = asyncio.run(_collect_all_routes_async())
        return result
    except Exception as exc:
        logger.error(f"Collection failed: {exc}")
        self.retry(exc=exc, countdown=60 * (self.request.retries + 1))
