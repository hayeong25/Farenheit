import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

import httpx
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.airline import Airline
from app.models.flight_price import FlightPrice
from app.models.route import Route
from app.schemas.flight import (
    AirlineInfo,
    FlightOffer,
    FlightSearchResponse,
    PriceHistoryResponse,
    PricePoint,
)

logger = logging.getLogger(__name__)

_TRIP_CLASS_MAP = {0: "ECONOMY", 1: "BUSINESS", 2: "FIRST"}
_DEFAULT_CURRENCY = "KRW"
_SOURCE = "travelpayouts"
_SEARCH_SOURCE = "travelpayouts-search"
_HTTP_TIMEOUT = 30.0
_DURATION_SORT_FALLBACK = 9999


class TravelpayoutsClient:
    """Travelpayouts Data API client for flight price search."""

    def __init__(self) -> None:
        self.base_url = settings.TRAVELPAYOUTS_BASE_URL
        self.token = settings.TRAVELPAYOUTS_TOKEN

    async def search_flights(
        self,
        origin: str,
        dest: str,
        departure_date: date,
        cabin_class: str = "ECONOMY",
        return_date: date | None = None,
    ) -> list[FlightOffer]:
        """Search multiple Travelpayouts endpoints in parallel for maximum data."""
        try:
            async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
                cheap_task = self._fetch_cheap(client, origin, dest)
                calendar_task = self._fetch_calendar(client, origin, dest, departure_date)
                month_task = self._fetch_month_matrix(client, origin, dest, departure_date)

                cheap_resp, calendar_resp, month_resp = await asyncio.gather(
                    cheap_task, calendar_task, month_task, return_exceptions=True,
                )

                all_offers: list[FlightOffer] = []

                if isinstance(cheap_resp, dict) and cheap_resp.get("success"):
                    all_offers.extend(self._parse_cheap(
                        cheap_resp.get("data", {}), departure_date, cabin_class, return_date,
                    ))

                if isinstance(calendar_resp, dict) and calendar_resp.get("success"):
                    all_offers.extend(self._parse_calendar(
                        calendar_resp.get("data", {}), departure_date, cabin_class, return_date,
                    ))

                if isinstance(month_resp, dict) and month_resp.get("success"):
                    all_offers.extend(self._parse_month_matrix(
                        month_resp.get("data", []), departure_date, cabin_class, return_date,
                    ))

                return all_offers
        except Exception as e:
            logger.error(f"Travelpayouts search error: {e}", exc_info=True)
            return []

    async def _fetch_cheap(self, client: httpx.AsyncClient, origin: str, dest: str) -> dict:
        """Fetch /v1/prices/cheap (no date filter for maximum results)."""
        resp = await client.get(
            f"{self.base_url}/v1/prices/cheap",
            params={"origin": origin, "destination": dest, "currency": _DEFAULT_CURRENCY, "token": self.token},
        )
        if resp.status_code == 200:
            return resp.json()
        logger.warning(f"Travelpayouts cheap failed: {resp.status_code}")
        return {}

    async def _fetch_calendar(
        self, client: httpx.AsyncClient, origin: str, dest: str, departure_date: date,
    ) -> dict:
        """Fetch /v1/prices/calendar for day-by-day prices."""
        resp = await client.get(
            f"{self.base_url}/v1/prices/calendar",
            params={
                "origin": origin, "destination": dest,
                "depart_date": departure_date.strftime("%Y-%m"),
                "calendar_type": "departure_date",
                "currency": _DEFAULT_CURRENCY, "token": self.token,
            },
        )
        if resp.status_code == 200:
            return resp.json()
        logger.warning(f"Travelpayouts calendar failed: {resp.status_code}")
        return {}

    async def _fetch_month_matrix(
        self, client: httpx.AsyncClient, origin: str, dest: str, departure_date: date,
    ) -> dict:
        """Fetch /v2/prices/month-matrix for monthly price data."""
        resp = await client.get(
            f"{self.base_url}/v2/prices/month-matrix",
            params={
                "origin": origin, "destination": dest,
                "month": departure_date.replace(day=1).isoformat(),
                "currency": _DEFAULT_CURRENCY, "token": self.token,
            },
        )
        if resp.status_code == 200:
            return resp.json()
        logger.warning(f"Travelpayouts month-matrix failed: {resp.status_code}")
        return {}

    def _parse_cheap(
        self, data: dict, departure_date: date, cabin_class: str, return_date: date | None,
    ) -> list[FlightOffer]:
        """Parse /v1/prices/cheap: {dest: {stops: offer}}."""
        offers: list[FlightOffer] = []
        for _dest_key, stops_dict in data.items():
            if not isinstance(stops_dict, dict):
                continue
            for stops_key, offer in stops_dict.items():
                try:
                    parsed = self._build_offer_from_cheap(offer, int(stops_key), departure_date, cabin_class, return_date)
                    if parsed:
                        offers.append(parsed)
                except (KeyError, ValueError, InvalidOperation) as e:
                    logger.warning(f"Failed to parse cheap offer: {e}")
        return offers

    def _parse_calendar(
        self, data: dict, departure_date: date, cabin_class: str, return_date: date | None,
    ) -> list[FlightOffer]:
        """Parse /v1/prices/calendar: {date_str: offer}."""
        offers: list[FlightOffer] = []
        for _date_key, offer in data.items():
            if not isinstance(offer, dict):
                continue
            try:
                airline_code = offer.get("airline", "")
                if not airline_code:
                    continue
                price = Decimal(str(offer["price"]))
                flight_number_raw = offer.get("flight_number")
                flight_number = f"{airline_code}{flight_number_raw}" if flight_number_raw else None
                stops = offer.get("transfers", 0)
                departure_at = offer.get("departure_at", "")
                return_at = offer.get("return_at", "")

                offers.append(FlightOffer(
                    airline_code=airline_code,
                    airline_name=None,
                    departure_date=departure_date,
                    return_date=return_date,
                    cabin_class=cabin_class,
                    price_amount=price,
                    currency=_DEFAULT_CURRENCY,
                    stops=stops,
                    duration_minutes=None,
                    source=_SOURCE,
                    departure_time=departure_at or None,
                    arrival_time=None,
                    flight_number=flight_number,
                    return_departure_time=return_at or None,
                ))
            except (KeyError, ValueError, InvalidOperation) as e:
                logger.warning(f"Failed to parse calendar offer: {e}")
        return offers

    def _parse_month_matrix(
        self, data: list, departure_date: date, cabin_class: str, return_date: date | None,
    ) -> list[FlightOffer]:
        """Parse /v2/prices/month-matrix: [{value, depart_date, ...}]."""
        offers: list[FlightOffer] = []
        for entry in data:
            if not isinstance(entry, dict):
                continue
            try:
                trip_class = entry.get("trip_class", 0)
                entry_cabin = _TRIP_CLASS_MAP.get(trip_class, "ECONOMY")
                if entry_cabin != cabin_class:
                    continue
                price = Decimal(str(entry["value"]))
                stops = entry.get("number_of_changes", 0)
                duration = entry.get("duration")
                duration_minutes = int(duration) if duration else None
                gate = entry.get("gate", "")

                offers.append(FlightOffer(
                    airline_code="",
                    airline_name=gate or None,
                    departure_date=departure_date,
                    return_date=return_date,
                    cabin_class=cabin_class,
                    price_amount=price,
                    currency=_DEFAULT_CURRENCY,
                    stops=stops,
                    duration_minutes=duration_minutes,
                    source=_SOURCE,
                ))
            except (KeyError, ValueError, InvalidOperation) as e:
                logger.warning(f"Failed to parse month-matrix offer: {e}")
        return offers

    def _build_offer_from_cheap(
        self, offer: dict, stops: int, departure_date: date,
        cabin_class: str, return_date: date | None,
    ) -> FlightOffer | None:
        price = Decimal(str(offer["price"]))
        airline_code = offer.get("airline", "")
        flight_number_raw = offer.get("flight_number")
        flight_number = f"{airline_code}{flight_number_raw}" if flight_number_raw and airline_code else None
        departure_at = offer.get("departure_at", "")
        return_at = offer.get("return_at", "")
        duration_to = offer.get("duration_to")
        duration_minutes = int(duration_to) if duration_to else None

        return FlightOffer(
            airline_code=airline_code,
            airline_name=None,
            departure_date=departure_date,
            return_date=return_date,
            cabin_class=cabin_class,
            price_amount=price,
            currency=_DEFAULT_CURRENCY,
            stops=stops,
            duration_minutes=duration_minutes,
            source=_SOURCE,
            departure_time=departure_at or None,
            arrival_time=None,
            flight_number=flight_number,
            return_departure_time=return_at or None,
        )


# Singleton
_tp_client = TravelpayoutsClient()


class FlightService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _ensure_route(self, origin: str, dest: str) -> Route | None:
        """Create route if it doesn't exist, so scheduler can collect data for it."""
        result = await self.db.execute(
            select(Route).where(Route.origin_code == origin, Route.dest_code == dest)
        )
        route = result.scalar_one_or_none()
        if not route:
            try:
                route = Route(origin_code=origin, dest_code=dest, is_active=True)
                self.db.add(route)
                await self.db.flush()
                logger.info(f"Auto-created route: {origin} -> {dest}")
            except IntegrityError:
                await self.db.rollback()
                # Race condition: another request may have created it
                result = await self.db.execute(
                    select(Route).where(Route.origin_code == origin, Route.dest_code == dest)
                )
                route = result.scalar_one_or_none()
        return route

    async def _store_search_results(
        self, route_id: int, offers: list[FlightOffer], cabin_class: str
    ) -> None:
        """Cache search results as price data for prediction pipeline."""
        now = datetime.now(timezone.utc)

        # Check which airline codes exist in DB
        airline_codes = list({o.airline_code for o in offers if o.airline_code})
        existing_airlines: set[str] = set()
        if airline_codes:
            result = await self.db.execute(
                select(Airline.iata_code).where(Airline.iata_code.in_(airline_codes))
            )
            existing_airlines = {row[0] for row in result.all()}

        # Deduplicate by PK (airline_code) before storing
        seen_airlines: set[str] = set()
        stored = 0
        for offer in offers:
            if not offer.airline_code or offer.airline_code not in existing_airlines:
                continue
            if offer.airline_code in seen_airlines:
                continue
            seen_airlines.add(offer.airline_code)
            try:
                price = FlightPrice(
                    time=now,
                    route_id=route_id,
                    airline_code=offer.airline_code,
                    departure_date=offer.departure_date,
                    cabin_class=cabin_class,
                    return_date=offer.return_date,
                    price_amount=offer.price_amount,
                    currency=offer.currency,
                    stops=offer.stops,
                    duration_minutes=offer.duration_minutes,
                    source=_SEARCH_SOURCE,
                )
                self.db.add(price)
                stored += 1
            except Exception as e:
                logger.warning(f"Failed to store price: {e}")
        if stored > 0:
            try:
                await self.db.commit()
                logger.info(f"Stored {stored} price observations from search")
            except Exception as e:
                logger.error(f"Failed to commit search prices: {e}", exc_info=True)
                await self.db.rollback()

    async def search(
        self,
        origin: str,
        dest: str,
        departure_date: date,
        cabin_class: str,
        max_stops: int | None = None,
        sort_by: str = "price",
        return_date: date | None = None,
    ) -> FlightSearchResponse:
        # Ensure route exists for future data collection
        route = await self._ensure_route(origin, dest)
        route_id: int | None = None
        if route:
            route_id = route.id
            try:
                await self.db.commit()
            except Exception as e:
                logger.debug(f"Route commit skipped (likely already committed): {e}")

        # Search Travelpayouts API for live results
        offers = await _tp_client.search_flights(
            origin, dest, departure_date, cabin_class, return_date
        )

        # Store search results as price data for predictions
        if offers and route_id:
            await self._store_search_results(route_id, offers, cabin_class)

        # If Travelpayouts returned nothing, fall back to DB cache
        data_source = "live"
        if not offers:
            offers = await self._search_from_db(origin, dest, departure_date, cabin_class)
            if offers:
                data_source = "cached"
                logger.info(f"Search fallback to cache: {origin}->{dest} ({len(offers)} cached offers)")
            else:
                logger.info(f"No results for {origin}->{dest} on {departure_date} (API + cache empty)")

        # Filter out invalid prices (0, negative, or non-finite)
        offers = [o for o in offers if o.price_amount > 0 and o.price_amount.is_finite()]

        # Deduplicate: keep cheapest per (airline, stops, duration bucket)
        offers = self._deduplicate_offers(offers)

        # Filter by stops
        if max_stops is not None:
            offers = [o for o in offers if o.stops <= max_stops]

        # Collect available airlines after stop filtering (skip empty airline_code from month-matrix)
        airline_set: dict[str, str] = {}
        for o in offers:
            if o.airline_code and o.airline_code not in airline_set:
                airline_set[o.airline_code] = o.airline_name or o.airline_code
        available_airlines = [
            AirlineInfo(code=code, name=name)
            for code, name in sorted(airline_set.items(), key=lambda x: x[1])
        ]

        # Sort
        if sort_by == "duration":
            offers.sort(key=lambda o: (o.duration_minutes or _DURATION_SORT_FALLBACK, o.price_amount))
        elif sort_by == "stops":
            offers.sort(key=lambda o: (o.stops, o.price_amount))
        else:
            offers.sort(key=lambda o: o.price_amount)

        trip_type = "round_trip" if return_date else "one_way"

        return FlightSearchResponse(
            origin=origin,
            destination=dest,
            departure_date=departure_date,
            return_date=return_date,
            trip_type=trip_type,
            cabin_class=cabin_class,
            offers=offers,
            total_count=len(offers),
            available_airlines=available_airlines,
            route_id=route_id,
            data_source=data_source,
        )

    @staticmethod
    def _deduplicate_offers(offers: list[FlightOffer]) -> list[FlightOffer]:
        """Keep the cheapest offer per (airline + stops). Prefer offers with more data."""
        seen: dict[str, FlightOffer] = {}
        for offer in offers:
            key = f"{offer.airline_code}|{offer.stops}"
            existing = seen.get(key)
            if not existing:
                seen[key] = offer
            elif offer.price_amount < existing.price_amount:
                seen[key] = offer
            elif offer.price_amount == existing.price_amount and offer.duration_minutes and not existing.duration_minutes:
                # Same price but new one has duration info
                seen[key] = offer
        return list(seen.values())

    async def _search_from_db(
        self, origin: str, dest: str, departure_date: date, cabin_class: str
    ) -> list[FlightOffer]:
        route_result = await self.db.execute(
            select(Route).where(Route.origin_code == origin, Route.dest_code == dest)
        )
        route = route_result.scalar_one_or_none()
        if not route:
            return []

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
            select(FlightPrice)
            .where(
                FlightPrice.route_id == route.id,
                FlightPrice.departure_date == departure_date,
                FlightPrice.cabin_class == cabin_class,
            )
            .join(
                subq,
                (FlightPrice.airline_code == subq.c.airline_code)
                & (FlightPrice.time == subq.c.latest_time),
            )
        )

        prices_list = result.scalars().all()
        if not prices_list:
            return []

        # Batch lookup airline names (avoid N+1)
        airline_codes = list({p.airline_code for p in prices_list if p.airline_code})
        airline_names: dict[str, str] = {}
        if airline_codes:
            airline_result = await self.db.execute(
                select(Airline.iata_code, Airline.name).where(Airline.iata_code.in_(airline_codes))
            )
            airline_names = {row.iata_code: row.name for row in airline_result.all()}

        offers = []
        for price in prices_list:
            offers.append(
                FlightOffer(
                    airline_code=price.airline_code,
                    airline_name=airline_names.get(price.airline_code),
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
        return offers

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
                sum(amounts) / Decimal(len(amounts)) if amounts else None
            ),
        )
