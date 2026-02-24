from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.flight_price import FlightPrice
from app.models.route import Route
from app.schemas.flight import (
    FlightOffer,
    FlightSearchResponse,
    PriceHistoryResponse,
    PricePoint,
)


class FlightService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def search(
        self, origin: str, dest: str, departure_date: date, cabin_class: str
    ) -> FlightSearchResponse:
        route_result = await self.db.execute(
            select(Route).where(Route.origin_code == origin, Route.dest_code == dest)
        )
        route = route_result.scalar_one_or_none()

        offers: list[FlightOffer] = []
        if route:
            # Get latest price for each airline
            subq = (
                select(
                    FlightPrice.airline_code,
                    func.max(FlightPrice.time).label("latest_time"),
                )
                .where(
                    FlightPrice.route_id == route.id,
                    FlightPrice.departure_date == departure_date,
                    FlightPrice.cabin_class == cabin_class,
                )
                .group_by(FlightPrice.airline_code)
                .subquery()
            )

            result = await self.db.execute(
                select(FlightPrice).join(
                    subq,
                    (FlightPrice.airline_code == subq.c.airline_code)
                    & (FlightPrice.time == subq.c.latest_time),
                )
            )

            for price in result.scalars().all():
                offers.append(
                    FlightOffer(
                        airline_code=price.airline_code,
                        departure_date=price.departure_date,
                        return_date=price.return_date,
                        cabin_class=price.cabin_class,
                        price_amount=price.price_amount,
                        currency=price.currency,
                        stops=price.stops,
                        duration_minutes=price.duration_minutes,
                        source=price.source,
                    )
                )

        return FlightSearchResponse(
            origin=origin,
            destination=dest,
            departure_date=departure_date,
            cabin_class=cabin_class,
            offers=sorted(offers, key=lambda o: o.price_amount),
            total_count=len(offers),
        )

    async def get_price_history(
        self,
        route_id: int,
        departure_date: date,
        airline_code: str | None,
        days: int,
    ) -> PriceHistoryResponse:
        since = datetime.now(timezone.utc) - timedelta(days=days)

        query = select(FlightPrice).where(
            FlightPrice.route_id == route_id,
            FlightPrice.departure_date == departure_date,
            FlightPrice.time >= since,
        )
        if airline_code:
            query = query.where(FlightPrice.airline_code == airline_code)
        query = query.order_by(FlightPrice.time.asc())

        result = await self.db.execute(query)
        rows = result.scalars().all()

        prices = [
            PricePoint(
                time=row.time,
                price_amount=row.price_amount,
                airline_code=row.airline_code,
                source=row.source,
            )
            for row in rows
        ]

        amounts = [p.price_amount for p in prices]

        return PriceHistoryResponse(
            route_id=route_id,
            departure_date=departure_date,
            airline_code=airline_code,
            prices=prices,
            min_price=min(amounts) if amounts else None,
            max_price=max(amounts) if amounts else None,
            avg_price=(
                Decimal(str(sum(amounts) / len(amounts))) if amounts else None
            ),
        )
