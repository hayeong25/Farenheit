import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

import httpx

from pipeline.collectors.base import AbstractCollector, PriceObservation
from pipeline.config import pipeline_settings

logger = logging.getLogger(__name__)


class AmadeusCollector(AbstractCollector):
    """Collect flight prices from Amadeus Flight Offers Search API."""

    def __init__(self) -> None:
        self.base_url = pipeline_settings.AMADEUS_BASE_URL
        self.client_id = pipeline_settings.AMADEUS_CLIENT_ID
        self.client_secret = pipeline_settings.AMADEUS_CLIENT_SECRET
        self._access_token: str | None = None
        self._token_expires_at: datetime | None = None
        self._token_lock = asyncio.Lock()

    async def _get_access_token(self, client: httpx.AsyncClient, force_refresh: bool = False) -> str:
        # Quick check without lock
        if not force_refresh and self._access_token and self._token_expires_at:
            if datetime.now(timezone.utc) < self._token_expires_at:
                return self._access_token

        async with self._token_lock:
            # Re-check after acquiring lock (another coroutine may have refreshed)
            if not force_refresh and self._access_token and self._token_expires_at:
                if datetime.now(timezone.utc) < self._token_expires_at:
                    return self._access_token

            try:
                response = await client.post(
                    f"{self.base_url}/v1/security/oauth2/token",
                    data={
                        "grant_type": "client_credentials",
                        "client_id": self.client_id,
                        "client_secret": self.client_secret,
                    },
                )
                response.raise_for_status()
                data = response.json()

                self._access_token = data["access_token"]
                expires_in = data.get("expires_in", 600)
                self._token_expires_at = datetime.now(timezone.utc) + timedelta(
                    seconds=max(expires_in - 60, 60)
                )

                return self._access_token
            except Exception:
                self._access_token = None
                self._token_expires_at = None
                raise

    async def collect(
        self,
        origin: str,
        destination: str,
        departure_date: date,
        return_date: date | None = None,
        cabin_class: str = "ECONOMY",
    ) -> list[PriceObservation]:
        observations: list[PriceObservation] = []

        async with httpx.AsyncClient(timeout=30.0) as client:
            token = await self._get_access_token(client)

            params: dict = {
                "originLocationCode": origin,
                "destinationLocationCode": destination,
                "departureDate": departure_date.isoformat(),
                "adults": 1,
                "travelClass": cabin_class,
                "max": 50,
                "currencyCode": "KRW",
            }
            if return_date:
                params["returnDate"] = return_date.isoformat()

            response = await client.get(
                f"{self.base_url}/v2/shopping/flight-offers",
                params=params,
                headers={"Authorization": f"Bearer {token}"},
            )

            # Retry once on 401 (token may have expired mid-collection)
            if response.status_code == 401:
                logger.info("Amadeus collector token expired, refreshing...")
                token = await self._get_access_token(client, force_refresh=True)
                response = await client.get(
                    f"{self.base_url}/v2/shopping/flight-offers",
                    params=params,
                    headers={"Authorization": f"Bearer {token}"},
                )

            if response.status_code == 200:
                data = response.json()
                now = datetime.now(timezone.utc)

                for offer in data.get("data", []):
                    try:
                        obs = self._parse_offer(offer, origin, destination, departure_date, return_date, cabin_class, now)
                        if obs:
                            observations.append(obs)
                    except (KeyError, ValueError) as e:
                        logger.warning(f"Failed to parse offer: {e}")
                        continue
            else:
                logger.error(
                    f"Amadeus API error: {response.status_code} - {response.text}"
                )

        return observations

    def _parse_offer(
        self,
        offer: dict,
        origin: str,
        destination: str,
        departure_date: date,
        return_date: date | None,
        cabin_class: str,
        now: datetime,
    ) -> PriceObservation | None:
        price_data = offer.get("price")
        if not price_data or "total" not in price_data:
            return None
        try:
            price = Decimal(str(price_data["total"]))
        except (InvalidOperation, TypeError):
            logger.warning(f"Invalid price value: {price_data.get('total')}")
            return None
        if price <= 0:
            logger.warning(f"Skipping offer with non-positive price: {price}")
            return None
        currency = price_data.get("currency", "KRW")

        # Get airline from first segment
        itineraries = offer.get("itineraries", [])
        if not itineraries:
            return None

        first_itinerary = itineraries[0]
        segments = first_itinerary.get("segments", [])
        if not segments:
            return None

        airline_code = segments[0].get("carrierCode", "")
        if not airline_code or len(airline_code) != 2:
            return None  # Skip offers without valid 2-char IATA airline code
        stops = len(segments) - 1

        # Parse duration
        duration_str = first_itinerary.get("duration", "")
        duration_minutes = self._parse_duration(duration_str)

        return PriceObservation(
            observed_at=now,
            origin=origin,
            destination=destination,
            airline_code=airline_code,
            departure_date=departure_date,
            return_date=return_date,
            cabin_class=cabin_class,
            price=price,
            currency=currency,
            stops=stops,
            duration_minutes=duration_minutes,
            source="amadeus",
            raw_offer_id=offer.get("id"),
        )

    @staticmethod
    def _parse_duration(duration_str: str) -> int | None:
        """Parse ISO 8601 duration (e.g., 'PT13H45M' or 'P1DT2H30M') to minutes."""
        if not duration_str:
            return None
        try:
            remainder = duration_str
            days = hours = minutes = 0
            # Strip P prefix
            if remainder.startswith("P"):
                remainder = remainder[1:]
            else:
                return None
            # Handle day component (e.g., P1DT2H30M)
            if "D" in remainder:
                d_part, remainder = remainder.split("D", 1)
                days = int(d_part)
            # Strip T separator
            if remainder.startswith("T"):
                remainder = remainder[1:]
            if "H" in remainder:
                h_part, remainder = remainder.split("H", 1)
                hours = int(h_part)
            if "M" in remainder:
                m_part, remainder = remainder.split("M", 1)
                if m_part:
                    minutes = int(m_part)
            return days * 24 * 60 + hours * 60 + minutes
        except (ValueError, TypeError):
            return None

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await self._get_access_token(client)
                return True
        except Exception:
            return False
