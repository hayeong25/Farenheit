import logging
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation

import httpx

from pipeline.collectors.base import AbstractCollector, PriceObservation
from pipeline.config import pipeline_settings

logger = logging.getLogger(__name__)

class TravelpayoutsCollector(AbstractCollector):
    """Collect flight prices from Travelpayouts Data API."""

    def __init__(self) -> None:
        self.base_url = pipeline_settings.TRAVELPAYOUTS_BASE_URL
        self.token = pipeline_settings.TRAVELPAYOUTS_TOKEN

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
            params: dict = {
                "origin": origin,
                "destination": destination,
                "depart_date": departure_date.isoformat(),
                "currency": "KRW",
                "token": self.token,
            }
            if return_date:
                params["return_date"] = return_date.isoformat()

            response = await client.get(
                f"{self.base_url}/v1/prices/cheap",
                params=params,
            )

            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    now = datetime.now(timezone.utc)
                    # Iterate all destination keys (API may return city code)
                    for _dest_key, stops_dict in data.get("data", {}).items():
                        if not isinstance(stops_dict, dict):
                            continue
                        for stops_key, offer in stops_dict.items():
                            try:
                                obs = self._parse_offer(
                                    offer, origin, destination, departure_date,
                                    return_date, cabin_class, now, int(stops_key),
                                )
                                if obs:
                                    observations.append(obs)
                            except (KeyError, ValueError) as e:
                                logger.warning(f"Failed to parse offer: {e}")
            elif response.status_code == 429:
                logger.warning("Travelpayouts rate limit reached")
            else:
                logger.error(
                    f"Travelpayouts API error: {response.status_code}"
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
        stops: int,
    ) -> PriceObservation | None:
        try:
            price = Decimal(str(offer["price"]))
        except (InvalidOperation, TypeError):
            logger.warning(f"Invalid price value: {offer.get('price')}")
            return None
        if price <= 0:
            return None

        airline_code = offer.get("airline", "")
        if not airline_code or len(airline_code) != 2:
            return None

        duration_to = offer.get("duration_to")
        duration_minutes = int(duration_to) if duration_to else None

        return PriceObservation(
            observed_at=now,
            origin=origin,
            destination=destination,
            airline_code=airline_code,
            departure_date=departure_date,
            return_date=return_date,
            cabin_class=cabin_class,
            price=price,
            currency="KRW",
            stops=stops,
            duration_minutes=duration_minutes,
            source="travelpayouts",
            raw_offer_id=None,
        )

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{self.base_url}/v1/prices/cheap",
                    params={"origin": "ICN", "destination": "NRT", "token": self.token},
                )
                return resp.status_code == 200
        except Exception:
            return False
