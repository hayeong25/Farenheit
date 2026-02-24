import logging
from datetime import date, datetime, timezone
from decimal import Decimal

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

    async def _get_access_token(self, client: httpx.AsyncClient) -> str:
        if self._access_token and self._token_expires_at:
            if datetime.now(timezone.utc) < self._token_expires_at:
                return self._access_token

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
        expires_in = data.get("expires_in", 1799)
        self._token_expires_at = datetime.now(timezone.utc).replace(
            second=0, microsecond=0
        )
        from datetime import timedelta

        self._token_expires_at += timedelta(seconds=expires_in - 60)

        return self._access_token

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
        price = Decimal(offer["price"]["total"])
        currency = offer["price"].get("currency", "USD")

        # Get airline from first segment
        itineraries = offer.get("itineraries", [])
        if not itineraries:
            return None

        first_itinerary = itineraries[0]
        segments = first_itinerary.get("segments", [])
        if not segments:
            return None

        airline_code = segments[0].get("carrierCode", "")
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
        """Parse ISO 8601 duration (e.g., 'PT13H45M') to minutes."""
        if not duration_str or not duration_str.startswith("PT"):
            return None

        duration_str = duration_str[2:]
        hours = 0
        minutes = 0

        if "H" in duration_str:
            h_part, duration_str = duration_str.split("H")
            hours = int(h_part)
        if "M" in duration_str:
            m_part = duration_str.replace("M", "")
            if m_part:
                minutes = int(m_part)

        return hours * 60 + minutes

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await self._get_access_token(client)
                return True
        except Exception:
            return False
