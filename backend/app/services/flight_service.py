import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

import httpx
from sqlalchemy import select, func, delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.airline import Airline
from app.models.flight_price import FlightPrice
from app.models.flight_schedule import FlightSchedule
from app.models.route import Route
from app.schemas.flight import (
    AirlineInfo,
    FlightOffer,
    FlightSearchResponse,
    PriceHistoryResponse,
    PricePoint,
)

logger = logging.getLogger(__name__)

_DEFAULT_CURRENCY = "KRW"
_SOURCE = "travelpayouts"
_SEARCH_SOURCE = "travelpayouts-search"
_HTTP_TIMEOUT = 30.0
_DURATION_SORT_FALLBACK = 9999
_SCHEDULE_CACHE_HOURS = 24


def _calc_duration_from_hhmm(dep_hhmm: str, arr_hhmm: str) -> int | None:
    """Calculate duration in minutes from HH:MM departure and arrival times."""
    try:
        dh, dm = int(dep_hhmm[:2]), int(dep_hhmm[3:5])
        ah, am = int(arr_hhmm[:2]), int(arr_hhmm[3:5])
        diff = (ah * 60 + am) - (dh * 60 + dm)
        if diff < 0:
            diff += 24 * 60  # next day arrival
        return diff if diff > 0 else None
    except (ValueError, IndexError):
        return None


def _extract_time(dt_str: str) -> str | None:
    """Extract HH:MM from ISO datetime string.

    Examples: "2026-04-27T10:25:00+09:00" → "10:25", "2026-06-14T09:00:00" → "09:00"
    """
    try:
        t_idx = dt_str.index("T")
        hhmm = dt_str[t_idx + 1 : t_idx + 6]  # "HH:MM"
        if len(hhmm) == 5 and hhmm[2] == ":":
            return hhmm
    except (ValueError, IndexError):
        pass
    return None


def _calc_arrival(departure_time_str: str | None, duration_minutes: int | None) -> str | None:
    """Calculate arrival time from departure + duration."""
    if not departure_time_str or not duration_minutes or duration_minutes <= 0:
        return None
    try:
        dep = datetime.fromisoformat(departure_time_str)
        arr = dep + timedelta(minutes=duration_minutes)
        return arr.isoformat()
    except (ValueError, TypeError):
        return None


class AirLabsClient:
    """AirLabs API client for flight schedule data."""

    def __init__(self) -> None:
        self.base_url = settings.AIRLABS_BASE_URL
        self.api_key = settings.AIRLABS_API_KEY

    async def fetch_schedules(self, origin: str, dest: str) -> list[dict]:
        """Fetch flight schedules from AirLabs API."""
        if not self.api_key:
            logger.warning("AirLabs API key not configured")
            return []
        try:
            async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
                resp = await client.get(
                    f"{self.base_url}/schedules",
                    params={
                        "dep_iata": origin,
                        "arr_iata": dest,
                        "api_key": self.api_key,
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return data.get("response", [])
                logger.warning(f"AirLabs schedules failed: {resp.status_code}")
                return []
        except Exception as e:
            logger.error(f"AirLabs API error: {e}")
            return []


_airlabs_client = AirLabsClient()

_AVIATIONSTACK_FUTURE_MIN_DAYS = 7
_AVIATIONSTACK_RETRY_DELAY = 1.5
_AVIATIONSTACK_MAX_RETRIES = 2


class AviationstackClient:
    """Aviationstack API client — fallback for LCC schedules missing from AirLabs."""

    def __init__(self) -> None:
        self.base_url = settings.AVIATIONSTACK_BASE_URL
        self.api_key = settings.AVIATIONSTACK_API_KEY

    async def fetch_schedules(
        self, origin: str, dest: str, target_date: date | None = None,
    ) -> list[dict]:
        """Fetch flight schedules from Aviationstack API.

        Uses /flightsFuture for dates >=7 days out, /timetable for nearer dates.
        Returns list[dict] in AirLabs-compatible format.
        """
        if not self.api_key:
            return []

        today = datetime.now(timezone.utc).date()
        use_future = target_date and (target_date - today).days >= _AVIATIONSTACK_FUTURE_MIN_DAYS

        try:
            async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
                if use_future:
                    params: dict = {
                        "access_key": self.api_key,
                        "iataCode": origin,
                        "type": "departure",
                        "date": target_date.isoformat(),
                    }
                    endpoint = f"{self.base_url}/flightsFuture"
                else:
                    params = {
                        "access_key": self.api_key,
                        "iataCode": origin,
                        "type": "departure",
                    }
                    endpoint = f"{self.base_url}/timetable"

                resp = await client.get(endpoint, params=params)
                # Retry on rate limit (429)
                for _ in range(_AVIATIONSTACK_MAX_RETRIES):
                    if resp.status_code != 429:
                        break
                    logger.info(f"Aviationstack 429, retrying after {_AVIATIONSTACK_RETRY_DELAY}s...")
                    await asyncio.sleep(_AVIATIONSTACK_RETRY_DELAY)
                    resp = await client.get(endpoint, params=params)

                if resp.status_code != 200:
                    logger.warning(f"Aviationstack failed: {resp.status_code}")
                    return []

                data = resp.json()
                raw_list = data if isinstance(data, list) else data.get("data", [])
                if not raw_list:
                    return []

                results: list[dict] = []
                for entry in raw_list:
                    arrival = entry.get("arrival", {})
                    departure = entry.get("departure", {})
                    flight = entry.get("flight", {})
                    airline = entry.get("airline", {})

                    arr_iata = (arrival.get("iataCode") or "").upper()
                    if arr_iata != dest:
                        continue

                    flight_iata = (flight.get("iataNumber") or "").upper()
                    airline_iata = (airline.get("iataCode") or "").upper()
                    dep_scheduled = departure.get("scheduledTime") or ""
                    arr_scheduled = arrival.get("scheduledTime") or ""

                    dep_hm = _extract_time(dep_scheduled) if "T" in dep_scheduled else dep_scheduled[:5]
                    arr_hm = _extract_time(arr_scheduled) if "T" in arr_scheduled else arr_scheduled[:5]

                    if not flight_iata or not dep_hm or not arr_hm:
                        continue

                    results.append({
                        "flight_iata": flight_iata,
                        "airline_iata": airline_iata,
                        "dep_time": dep_hm,
                        "arr_time": arr_hm,
                        "dep_terminal": departure.get("terminal"),
                        "arr_terminal": arrival.get("terminal"),
                    })

                logger.info(f"Aviationstack: {origin}->{dest} got {len(results)} flights")
                return results

        except Exception as e:
            logger.error(f"Aviationstack API error: {e}")
            return []


_aviationstack_client = AviationstackClient()


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

                cheap_resp, calendar_resp = await asyncio.gather(
                    cheap_task, calendar_task, return_exceptions=True,
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

    async def fetch_return_flight_info(
        self, origin: str, dest: str, return_date: date,
    ) -> dict[str, dict]:
        """Fetch return flight info (number, departure_at, duration) from reverse route.

        Returns {airline_code: {"flight_number": str, "departure_at": str|None, "duration_minutes": int|None}}.
        """
        result: dict[str, dict] = {}
        try:
            async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
                cheap_task = self._fetch_cheap(client, dest, origin)
                cal_task = self._fetch_calendar(client, dest, origin, return_date)
                cheap_resp, cal_resp = await asyncio.gather(
                    cheap_task, cal_task, return_exceptions=True,
                )

                # Parse cheap response (has duration_to)
                if isinstance(cheap_resp, dict) and cheap_resp.get("success"):
                    for _dest_key, stops_dict in cheap_resp.get("data", {}).items():
                        if not isinstance(stops_dict, dict):
                            continue
                        for _stops_key, offer in stops_dict.items():
                            airline = offer.get("airline", "")
                            fn_raw = offer.get("flight_number")
                            if airline and fn_raw and airline not in result:
                                departure_at = offer.get("departure_at", "")
                                duration_to = offer.get("duration_to")
                                result[airline] = {
                                    "flight_number": f"{airline}{fn_raw}",
                                    "departure_at": departure_at or None,
                                    "duration_minutes": int(duration_to) if duration_to else None,
                                }

                # Parse calendar response
                if isinstance(cal_resp, dict) and cal_resp.get("success"):
                    for _date_key, offer in cal_resp.get("data", {}).items():
                        if not isinstance(offer, dict):
                            continue
                        airline = offer.get("airline", "")
                        fn_raw = offer.get("flight_number")
                        if airline and fn_raw and airline not in result:
                            departure_at = offer.get("departure_at", "")
                            result[airline] = {
                                "flight_number": f"{airline}{fn_raw}",
                                "departure_at": departure_at or None,
                                "duration_minutes": None,
                            }

        except Exception as e:
            logger.warning(f"Failed to fetch return flight info: {e}")
        return result

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
                if not airline_code or len(airline_code) != 2:
                    continue
                price = Decimal(str(offer["price"]))
                if price <= 0:
                    continue
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
                    return_departure_time=(return_at or None) if return_date else None,
                    return_stops=stops if return_date else None,
                ))
            except (KeyError, ValueError, InvalidOperation) as e:
                logger.warning(f"Failed to parse calendar offer: {e}")
        return offers

    def _build_offer_from_cheap(
        self, offer: dict, stops: int, departure_date: date,
        cabin_class: str, return_date: date | None,
    ) -> FlightOffer | None:
        price = Decimal(str(offer["price"]))
        if price <= 0:
            return None
        airline_code = offer.get("airline", "")
        flight_number_raw = offer.get("flight_number")
        flight_number = f"{airline_code}{flight_number_raw}" if flight_number_raw and airline_code else None
        departure_at = offer.get("departure_at", "")
        return_at = offer.get("return_at", "")
        duration_to = offer.get("duration_to")
        duration_minutes = int(duration_to) if duration_to else None

        dep_time = departure_at or None
        arr_time = _calc_arrival(dep_time, duration_minutes)

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
            departure_time=dep_time,
            arrival_time=arr_time,
            flight_number=flight_number,
            return_departure_time=(return_at or None) if return_date else None,
            return_stops=stops if return_date else None,
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

    async def _get_schedules(
        self, origin: str, dest: str, target_date: date | None = None,
        avstack_prefetch: list[dict] | None = None,
    ) -> list[FlightSchedule]:
        """Get flight schedules with 24h DB cache, falling back to AirLabs + Aviationstack.

        Args:
            avstack_prefetch: Pre-fetched Aviationstack data to avoid duplicate API calls.
        """
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        cutoff = now - timedelta(hours=_SCHEDULE_CACHE_HOURS)

        # Check DB cache
        result = await self.db.execute(
            select(FlightSchedule).where(
                FlightSchedule.origin_code == origin,
                FlightSchedule.dest_code == dest,
                FlightSchedule.fetched_at >= cutoff,
            )
        )
        cached = result.scalars().all()
        if cached:
            # Supplement cache with pre-fetched Aviationstack data for missing airlines
            if avstack_prefetch is not None:
                cached_airlines = {s.airline_code for s in cached}
                new_schedules: list[FlightSchedule] = []
                seen_flights: set[str] = set()
                for entry in avstack_prefetch:
                    airline = entry.get("airline_iata", "")[:2]
                    if not airline or airline in cached_airlines:
                        continue
                    flight_iata = entry.get("flight_iata", "")
                    dep_time = entry.get("dep_time", "")
                    arr_time = entry.get("arr_time", "")
                    if not flight_iata or not dep_time or not arr_time:
                        continue
                    if flight_iata in seen_flights:
                        continue
                    dep_hm = _extract_time(dep_time) or dep_time[:5]
                    arr_hm = _extract_time(arr_time) or arr_time[:5]
                    sched = FlightSchedule(
                        origin_code=origin, dest_code=dest, airline_code=airline,
                        flight_iata=flight_iata, dep_time=dep_hm, arr_time=arr_hm,
                        dep_terminal=entry.get("dep_terminal"),
                        arr_terminal=entry.get("arr_terminal"),
                        status=entry.get("status"), fetched_at=now,
                    )
                    new_schedules.append(sched)
                    seen_flights.add(flight_iata)
                if new_schedules:
                    try:
                        self.db.add_all(new_schedules)
                        await self.db.commit()
                        logger.info(f"Supplemented {len(new_schedules)} schedules: {origin}->{dest}")
                    except Exception as e:
                        logger.error(f"Failed to store supplemental schedules: {e}")
                        await self.db.rollback()
                    cached = list(cached) + new_schedules
            logger.debug(f"Schedule cache hit: {origin}->{dest} ({len(cached)} flights)")
            return list(cached)

        # Fetch from AirLabs
        raw = await _airlabs_client.fetch_schedules(origin, dest)

        # Supplement with Aviationstack for airlines missing from AirLabs
        airlabs_airlines = {
            entry.get("airline_iata", "")[:2]
            for entry in raw if entry.get("airline_iata")
        }
        avstack_raw = avstack_prefetch if avstack_prefetch is not None else (
            await _aviationstack_client.fetch_schedules(origin, dest, target_date)
        )
        for entry in avstack_raw:
            airline = entry.get("airline_iata", "")[:2]
            if airline and airline not in airlabs_airlines:
                raw.append(entry)

        if not raw:
            # Return stale cache if available
            result = await self.db.execute(
                select(FlightSchedule).where(
                    FlightSchedule.origin_code == origin,
                    FlightSchedule.dest_code == dest,
                )
            )
            stale = result.scalars().all()
            if stale:
                logger.info(f"AirLabs+Aviationstack failed, using stale cache: {origin}->{dest}")
                return list(stale)
            return []

        # Delete old cache for this route
        await self.db.execute(
            delete(FlightSchedule).where(
                FlightSchedule.origin_code == origin,
                FlightSchedule.dest_code == dest,
            )
        )

        # Store new schedules
        schedules: list[FlightSchedule] = []
        for entry in raw:
            flight_iata = entry.get("flight_iata", "")
            airline_iata = entry.get("airline_iata", "")
            dep_time = entry.get("dep_time", "")
            arr_time = entry.get("arr_time", "")
            if not flight_iata or not dep_time or not arr_time or not airline_iata:
                continue
            # Extract HH:MM from full datetime or time string
            dep_hm = _extract_time(dep_time) or dep_time[:5]
            arr_hm = _extract_time(arr_time) or arr_time[:5]
            sched = FlightSchedule(
                origin_code=origin,
                dest_code=dest,
                airline_code=airline_iata[:2] if airline_iata else "",
                flight_iata=flight_iata,
                dep_time=dep_hm,
                arr_time=arr_hm,
                dep_terminal=entry.get("dep_terminal"),
                arr_terminal=entry.get("arr_terminal"),
                status=entry.get("status"),
                fetched_at=now,
            )
            schedules.append(sched)

        # Bulk add and commit — if it fails, objects remain usable (never flushed)
        try:
            self.db.add_all(schedules)
            await self.db.commit()
            logger.info(f"Cached {len(schedules)} schedules: {origin}->{dest}")
        except Exception as e:
            logger.error(f"Failed to cache schedules: {e}")
            await self.db.rollback()

        return schedules

    @staticmethod
    def _match_schedule(
        offer_flight_number: str | None,
        offer_airline_code: str,
        by_flight: dict[str, FlightSchedule],
        by_airline: dict[str, FlightSchedule],
    ) -> tuple[FlightSchedule | None, str | None]:
        """Find the best matching schedule. Returns (schedule, resolved_flight_number)."""
        sched: FlightSchedule | None = None
        resolved_fn = offer_flight_number
        if offer_flight_number:
            sched = by_flight.get(offer_flight_number)
        if not sched and offer_airline_code:
            sched = by_airline.get(offer_airline_code)
            if sched and not offer_flight_number:
                resolved_fn = sched.flight_iata
        return sched, resolved_fn

    def _enrich_with_schedules(
        self,
        offers: list[FlightOffer],
        outbound_schedules: list[FlightSchedule],
        return_schedules: list[FlightSchedule],
        departure_date: date,
        return_date: date | None,
    ) -> None:
        """Enrich offers with departure/arrival times from cached schedules."""
        # Build outbound lookup maps
        ob_by_flight: dict[str, FlightSchedule] = {}
        ob_by_airline: dict[str, FlightSchedule] = {}
        for s in outbound_schedules:
            ob_by_flight[s.flight_iata] = s
            if s.airline_code and s.airline_code not in ob_by_airline:
                ob_by_airline[s.airline_code] = s

        # Build return lookup maps
        rt_by_flight: dict[str, FlightSchedule] = {}
        rt_by_airline: dict[str, FlightSchedule] = {}
        for s in return_schedules:
            rt_by_flight[s.flight_iata] = s
            if s.airline_code and s.airline_code not in rt_by_airline:
                rt_by_airline[s.airline_code] = s

        dep_str = departure_date.isoformat()
        ret_str = return_date.isoformat() if return_date else None

        for offer in offers:
            # Outbound leg
            ob_matched = False
            if outbound_schedules:
                sched, fn = self._match_schedule(
                    offer.flight_number, offer.airline_code, ob_by_flight, ob_by_airline,
                )
                if sched:
                    ob_matched = True
                    offer.departure_time = f"{dep_str}T{sched.dep_time}:00"
                    dur = _calc_duration_from_hhmm(sched.dep_time, sched.arr_time)
                    if not offer.duration_minutes and dur:
                        offer.duration_minutes = dur
                    # Use _calc_arrival for correct next-day arrival date
                    offer.arrival_time = _calc_arrival(offer.departure_time, dur or offer.duration_minutes)
                    if fn:
                        offer.flight_number = fn

            # Outbound fallbacks when schedule match failed
            if not ob_matched:
                if offer.departure_time:
                    time_part = _extract_time(offer.departure_time)
                    if time_part:
                        offer.departure_time = f"{dep_str}T{time_part}:00"
                # Borrow duration from any outbound schedule on same route
                if not offer.duration_minutes and outbound_schedules:
                    any_sched = outbound_schedules[0]
                    offer.duration_minutes = _calc_duration_from_hhmm(any_sched.dep_time, any_sched.arr_time)
                if not offer.arrival_time and offer.departure_time and offer.duration_minutes:
                    offer.arrival_time = _calc_arrival(offer.departure_time, offer.duration_minutes)

            # Return leg — exact flight-number match first, then airline-code fallback
            if ret_str:
                rsched: FlightSchedule | None = None
                if return_schedules:
                    if offer.return_flight_number:
                        rsched = rt_by_flight.get(offer.return_flight_number)
                    # Airline-code fallback (now reliable with Aviationstack future schedules)
                    if not rsched and offer.airline_code:
                        rsched = rt_by_airline.get(offer.airline_code)
                        if rsched and not offer.return_flight_number:
                            offer.return_flight_number = rsched.flight_iata
                    if rsched:
                        offer.return_departure_time = f"{ret_str}T{rsched.dep_time}:00"
                        rdur = _calc_duration_from_hhmm(rsched.dep_time, rsched.arr_time)
                        if not offer.return_duration_minutes and rdur:
                            offer.return_duration_minutes = rdur
                        offer.return_arrival_time = _calc_arrival(offer.return_departure_time, rdur or offer.return_duration_minutes)

                # Fallbacks when return schedule match failed
                if not rsched:
                    # Fix return_departure_time date (Travelpayouts may return wrong date)
                    if offer.return_departure_time:
                        time_part = _extract_time(offer.return_departure_time)
                        if time_part:
                            offer.return_departure_time = f"{ret_str}T{time_part}:00"

                    # Use outbound duration as fallback for return duration
                    if not offer.return_duration_minutes and offer.duration_minutes:
                        offer.return_duration_minutes = offer.duration_minutes

                    # Calculate return_arrival_time from departure + duration
                    if not offer.return_arrival_time and offer.return_departure_time and offer.return_duration_minutes:
                        offer.return_arrival_time = _calc_arrival(offer.return_departure_time, offer.return_duration_minutes)

    async def _store_search_results(
        self, route_id: int, offers: list[FlightOffer], cabin_class: str
    ) -> None:
        """Cache search results as price data for prediction pipeline."""
        now = datetime.now(timezone.utc).replace(tzinfo=None)

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

    async def _get_missing_airline_offers(
        self,
        route_id: int,
        departure_date: date,
        cabin_class: str,
        return_date: date | None,
        live_airlines: set[str],
    ) -> list[FlightOffer]:
        """Fetch latest DB prices for airlines missing from live results."""
        filters = [
            FlightPrice.route_id == route_id,
            FlightPrice.departure_date == departure_date,
            FlightPrice.cabin_class == cabin_class,
        ]
        if live_airlines:
            filters.append(FlightPrice.airline_code.notin_(list(live_airlines)))
        subq = (
            select(
                FlightPrice.airline_code,
                func.max(FlightPrice.time).label("latest_time"),
            )
            .where(*filters)
            .group_by(FlightPrice.airline_code)
            .subquery()
        )

        result = await self.db.execute(
            select(FlightPrice)
            .where(
                FlightPrice.route_id == route_id,
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
        supplements: list[FlightOffer] = []
        for price in prices_list:
            if price.airline_code in live_airlines:
                continue
            supplements.append(
                FlightOffer(
                    airline_code=price.airline_code,
                    airline_name=None,
                    departure_date=price.departure_date,
                    return_date=return_date,
                    cabin_class=price.cabin_class,
                    price_amount=price.price_amount,
                    currency=price.currency,
                    stops=price.stops,
                    duration_minutes=price.duration_minutes,
                    source=price.source,
                    return_stops=price.stops if return_date else None,
                )
            )
        if supplements:
            logger.info(
                f"Supplemented {len(supplements)} airlines from DB: "
                f"{[s.airline_code for s in supplements]}"
            )
        return supplements

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

        # Filter out invalid prices and empty airline codes (OTA like Kiwi.com)
        offers = [
            o for o in offers
            if o.price_amount > 0 and o.price_amount.is_finite() and o.airline_code
        ]

        # Supplement missing airlines from DB cache
        if route_id and offers:
            live_airlines = {o.airline_code for o in offers}
            db_supplements = await self._get_missing_airline_offers(
                route_id, departure_date, cabin_class, return_date, live_airlines,
            )
            offers.extend(db_supplements)

        # Enrich airline names from DB (first pass - before supplement)
        codes_to_lookup = {o.airline_code for o in offers if not o.airline_name}
        name_map: dict[str, str] = {}
        if codes_to_lookup:
            result = await self.db.execute(
                select(Airline.iata_code, Airline.name).where(
                    Airline.iata_code.in_(list(codes_to_lookup))
                )
            )
            name_map = {row.iata_code: row.name for row in result.all()}
            for o in offers:
                if not o.airline_name and o.airline_code in name_map:
                    o.airline_name = name_map[o.airline_code]

        # Step 1: Pre-fill return flight numbers from Travelpayouts reverse route
        # This must run BEFORE AirLabs enrichment so exact flight-number matching works
        reverse_info: dict[str, dict] = {}
        if return_date:
            reverse_info = await _tp_client.fetch_return_flight_info(origin, dest, return_date)
            for o in offers:
                if not o.return_flight_number and o.airline_code:
                    info = reverse_info.get(o.airline_code)
                    if info and info["flight_number"]:
                        o.return_flight_number = info["flight_number"]

        # Step 2: Enrich with schedule data (AirLabs + Aviationstack fallback)
        # Pre-fetch Aviationstack for directions missing from cache to avoid 429 rate limits
        now_check = datetime.now(timezone.utc).replace(tzinfo=None)
        cutoff_check = now_check - timedelta(hours=_SCHEDULE_CACHE_HOURS)
        offer_airlines = {o.airline_code for o in offers if o.airline_code}

        async def _check_cache_coverage(orig: str, dst: str) -> bool:
            """Check if DB cache covers all offer airlines."""
            result = await self.db.execute(
                select(FlightSchedule.airline_code).where(
                    FlightSchedule.origin_code == orig,
                    FlightSchedule.dest_code == dst,
                    FlightSchedule.fetched_at >= cutoff_check,
                )
            )
            cached_airlines = {row[0] for row in result.all()}
            return offer_airlines.issubset(cached_airlines) if cached_airlines else False

        ob_covered = await _check_cache_coverage(origin, dest)
        rt_covered = await _check_cache_coverage(dest, origin) if return_date else True

        # Only call Aviationstack when cache is incomplete
        avstack_outbound: list[dict] | None = None
        avstack_return: list[dict] | None = None
        if not ob_covered:
            avstack_outbound = await _aviationstack_client.fetch_schedules(origin, dest, departure_date)
        if return_date and not rt_covered:
            if avstack_outbound is not None:
                await asyncio.sleep(_AVIATIONSTACK_RETRY_DELAY)
            avstack_return = await _aviationstack_client.fetch_schedules(dest, origin, return_date)

        outbound_schedules = await self._get_schedules(
            origin, dest, departure_date, avstack_prefetch=avstack_outbound,
        )
        return_schedules: list[FlightSchedule] = []
        if return_date:
            return_schedules = await self._get_schedules(
                dest, origin, return_date, avstack_prefetch=avstack_return,
            )
        self._enrich_with_schedules(offers, outbound_schedules, return_schedules, departure_date, return_date)

        # Step 3: For offers that didn't get exact AirLabs return match,
        # override with reverse-route Travelpayouts times
        if return_date and reverse_info:
            ret_str = return_date.isoformat()
            rt_flight_set = {s.flight_iata for s in return_schedules}

            for o in offers:
                if not o.airline_code:
                    continue

                # Skip offers that got an exact AirLabs flight match
                if o.return_flight_number and o.return_flight_number in rt_flight_set:
                    continue

                info = reverse_info.get(o.airline_code)
                if info:
                    dep_at = info.get("departure_at")
                    dur = info.get("duration_minutes")

                    # Prefer reverse-route flight number
                    if info["flight_number"]:
                        o.return_flight_number = info["flight_number"]

                    if dep_at:
                        time_part = _extract_time(dep_at)
                        if time_part:
                            o.return_departure_time = f"{ret_str}T{time_part}:00"

                    if dur:
                        o.return_duration_minutes = dur

                # Duration fallback from outbound
                if not o.return_duration_minutes and o.duration_minutes:
                    o.return_duration_minutes = o.duration_minutes

                # Recalculate arrival from corrected departure + duration
                if o.return_departure_time and o.return_duration_minutes:
                    o.return_arrival_time = _calc_arrival(
                        o.return_departure_time, o.return_duration_minutes
                    )

        # Step 4: Last-resort return_flight_number from outbound schedules
        # When return schedules are unavailable, infer from outbound flight pattern
        if return_date:
            for o in offers:
                if o.return_flight_number or not o.flight_number:
                    continue
                # Try return schedules airline-code match (might have been added by supplement)
                rsched = next((s for s in return_schedules if s.airline_code == o.airline_code), None)
                if rsched:
                    o.return_flight_number = rsched.flight_iata
                    continue
                # If no return schedule at all, use outbound flight_number + 1 heuristic
                # (common for Asian LCCs: odd=outbound, even=return)
                fn = o.flight_number
                al = o.airline_code or ""
                num_part = fn[len(al):] if fn.startswith(al) else fn[2:]
                if num_part.isdigit():
                    next_num = int(num_part) + 1
                    o.return_flight_number = f"{al}{next_num}"
                    logger.debug(f"Inferred return flight: {o.flight_number} -> {o.return_flight_number}")

        # Deduplicate: keep cheapest per (airline, stops, duration bucket)
        offers = self._deduplicate_offers(offers)

        # Filter by stops
        if max_stops is not None:
            offers = [o for o in offers if o.stops <= max_stops]

        # Collect available airlines after stop filtering
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
        since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)

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
                (sum(amounts) / Decimal(len(amounts))).quantize(Decimal("0.01")) if amounts else None
            ),
        )
