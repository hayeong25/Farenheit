import logging
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import httpx
from sqlalchemy import select, func
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


class AmadeusClient:
    """Lightweight Amadeus API client for real-time search."""

    def __init__(self) -> None:
        self.base_url = settings.AMADEUS_BASE_URL
        self.client_id = settings.AMADEUS_CLIENT_ID
        self.client_secret = settings.AMADEUS_CLIENT_SECRET
        self._access_token: str | None = None
        self._token_expires_at: datetime | None = None

    async def _get_token(self, client: httpx.AsyncClient) -> str:
        if self._access_token and self._token_expires_at:
            if datetime.now(timezone.utc) < self._token_expires_at:
                return self._access_token

        resp = await client.post(
            f"{self.base_url}/v1/security/oauth2/token",
            data={
                "grant_type": "client_credentials",
                "client_id": self.client_id,
                "client_secret": self.client_secret,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        self._access_token = data["access_token"]
        expires_in = data.get("expires_in", 1799)
        self._token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in - 60)
        return self._access_token

    async def search_flights(
        self,
        origin: str,
        dest: str,
        departure_date: date,
        cabin_class: str = "ECONOMY",
        return_date: date | None = None,
    ) -> list[FlightOffer]:
        offers: list[FlightOffer] = []
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                token = await self._get_token(client)
                params: dict = {
                    "originLocationCode": origin,
                    "destinationLocationCode": dest,
                    "departureDate": departure_date.isoformat(),
                    "adults": 1,
                    "travelClass": cabin_class,
                    "max": 50,
                    "currencyCode": "KRW",
                }
                if return_date:
                    params["returnDate"] = return_date.isoformat()

                resp = await client.get(
                    f"{self.base_url}/v2/shopping/flight-offers",
                    params=params,
                    headers={"Authorization": f"Bearer {token}"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    carriers = data.get("dictionaries", {}).get("carriers", {})
                    for offer in data.get("data", []):
                        parsed = self._parse_offer(
                            offer, departure_date, cabin_class, carriers, return_date
                        )
                        if parsed:
                            offers.append(parsed)
                else:
                    logger.warning(f"Amadeus search failed: {resp.status_code} - {resp.text[:200]}")
        except Exception as e:
            logger.error(f"Amadeus search error: {e}")
        return offers

    def _parse_offer(
        self,
        offer: dict,
        departure_date: date,
        cabin_class: str,
        carriers: dict,
        return_date: date | None = None,
    ) -> FlightOffer | None:
        try:
            price = Decimal(offer["price"]["grandTotal"])
            currency = offer["price"].get("currency", "KRW")
            itineraries = offer.get("itineraries", [])
            if not itineraries:
                return None

            # Outbound leg
            outbound = itineraries[0]
            ob_segments = outbound.get("segments", [])
            if not ob_segments:
                return None

            airline_code = ob_segments[0].get("carrierCode", "")
            airline_name = carriers.get(airline_code, airline_code)
            flight_number_raw = ob_segments[0].get("number", "")
            flight_number = f"{airline_code}{flight_number_raw}" if flight_number_raw else None
            stops = len(ob_segments) - 1
            duration_minutes = self._parse_duration(outbound.get("duration", ""))
            departure_time = ob_segments[0].get("departure", {}).get("at", "")
            arrival_time = ob_segments[-1].get("arrival", {}).get("at", "")

            # Return leg (round-trip)
            return_flight_number = None
            return_departure_time = None
            return_arrival_time = None
            return_stops = None
            return_duration_minutes = None

            if len(itineraries) > 1:
                inbound = itineraries[1]
                ib_segments = inbound.get("segments", [])
                if ib_segments:
                    ib_carrier = ib_segments[0].get("carrierCode", "")
                    ib_number = ib_segments[0].get("number", "")
                    return_flight_number = f"{ib_carrier}{ib_number}" if ib_number else None
                    return_departure_time = ib_segments[0].get("departure", {}).get("at", "")
                    return_arrival_time = ib_segments[-1].get("arrival", {}).get("at", "")
                    return_stops = len(ib_segments) - 1
                    return_duration_minutes = self._parse_duration(inbound.get("duration", ""))

            return FlightOffer(
                airline_code=airline_code,
                airline_name=airline_name,
                departure_date=departure_date,
                return_date=return_date,
                cabin_class=cabin_class,
                price_amount=price,
                currency=currency,
                stops=stops,
                duration_minutes=duration_minutes,
                source="amadeus",
                departure_time=departure_time,
                arrival_time=arrival_time,
                flight_number=flight_number,
                return_flight_number=return_flight_number,
                return_departure_time=return_departure_time,
                return_arrival_time=return_arrival_time,
                return_stops=return_stops,
                return_duration_minutes=return_duration_minutes,
            )
        except (KeyError, ValueError) as e:
            logger.warning(f"Failed to parse offer: {e}")
            return None

    @staticmethod
    def _parse_duration(duration_str: str) -> int | None:
        if not duration_str or not duration_str.startswith("PT"):
            return None
        duration_str = duration_str[2:]
        hours = minutes = 0
        if "H" in duration_str:
            h_part, duration_str = duration_str.split("H")
            hours = int(h_part)
        if "M" in duration_str:
            m_part = duration_str.replace("M", "")
            if m_part:
                minutes = int(m_part)
        return hours * 60 + minutes


# Singleton
_amadeus_client = AmadeusClient()


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
            except Exception:
                await self.db.rollback()
                route = None
        return route

    async def _store_search_results(
        self, route: Route, offers: list[FlightOffer], cabin_class: str
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

        stored = 0
        for offer in offers:
            if offer.airline_code not in existing_airlines:
                continue  # Skip airlines not in reference data
            try:
                price = FlightPrice(
                    time=now,
                    route_id=route.id,
                    airline_code=offer.airline_code,
                    departure_date=offer.departure_date,
                    cabin_class=cabin_class,
                    return_date=offer.return_date,
                    price_amount=offer.price_amount,
                    currency=offer.currency,
                    stops=offer.stops,
                    duration_minutes=offer.duration_minutes,
                    source="amadeus-search",
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
                logger.warning(f"Failed to commit search prices: {e}")
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

        # Search Amadeus API for live results
        offers = await _amadeus_client.search_flights(
            origin, dest, departure_date, cabin_class, return_date
        )

        # Store search results as price data for predictions
        if offers and route:
            await self._store_search_results(route, offers, cabin_class)

        # If Amadeus returned nothing, fall back to DB cache
        if not offers:
            offers = await self._search_from_db(origin, dest, departure_date, cabin_class)

        # Deduplicate: keep cheapest per (airline, stops, duration bucket)
        offers = self._deduplicate_offers(offers)

        # Collect available airlines before filtering
        airline_set: dict[str, str] = {}
        for o in offers:
            if o.airline_code not in airline_set:
                airline_set[o.airline_code] = o.airline_name or o.airline_code
        available_airlines = [
            AirlineInfo(code=code, name=name)
            for code, name in sorted(airline_set.items(), key=lambda x: x[1])
        ]

        # Filter by stops
        if max_stops is not None:
            offers = [o for o in offers if o.stops <= max_stops]

        # Sort
        if sort_by == "duration":
            offers.sort(key=lambda o: (o.duration_minutes or 9999, o.price_amount))
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
        )

    @staticmethod
    def _deduplicate_offers(offers: list[FlightOffer]) -> list[FlightOffer]:
        """Keep the cheapest offer per unique itinerary (airline + stops + ~duration)."""
        seen: dict[str, FlightOffer] = {}
        for offer in offers:
            # Round duration to 30-min buckets to group similar flights
            dur_bucket = (offer.duration_minutes or 0) // 30
            key = f"{offer.airline_code}|{offer.stops}|{dur_bucket}"
            if key not in seen or offer.price_amount < seen[key].price_amount:
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
            select(FlightPrice).join(
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
                sum(amounts) / len(amounts) if amounts else None
            ),
        )
