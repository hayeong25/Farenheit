import asyncio
import logging
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation

import httpx

from pipeline.collectors.base import AbstractCollector, PriceObservation
from pipeline.config import pipeline_settings

logger = logging.getLogger(__name__)

_DEFAULT_CURRENCY = "KRW"
_SOURCE = "travelpayouts"
_COLLECT_TIMEOUT = 30.0
_HEALTH_CHECK_TIMEOUT = 10.0
_RETRY_BASE_DELAY = 1.0
_MAX_PRICE_KRW = 50_000_000  # 5천만원 초과 가격은 데이터 오류로 판단


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
        max_retries = pipeline_settings.MAX_RETRIES

        params: dict = {
            "origin": origin,
            "destination": destination,
            "depart_date": departure_date.isoformat(),
            "currency": _DEFAULT_CURRENCY,
            "token": self.token,
        }
        # NOTE: Do NOT send return_date — Travelpayouts returns empty
        # results when return_date is included. Use response's return_at instead.

        for attempt in range(max_retries):
            try:
                async with httpx.AsyncClient(timeout=_COLLECT_TIMEOUT) as client:
                    response = await client.get(
                        f"{self.base_url}/v1/prices/cheap",
                        params=params,
                    )

                if response.status_code == 200:
                    try:
                        data = response.json()
                    except Exception as e:
                        logger.error(f"Failed to parse JSON response: {e}")
                        return observations
                    if data.get("success"):
                        now = datetime.now(timezone.utc).replace(tzinfo=None)
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
                    return observations
                elif response.status_code == 429:
                    logger.warning("Travelpayouts rate limit reached")
                    return observations  # Don't retry rate limits
                else:
                    logger.warning(
                        f"Travelpayouts API error: {response.status_code} (attempt {attempt + 1}/{max_retries})"
                    )
            except (httpx.HTTPError, httpx.TimeoutException) as e:
                logger.warning(f"Travelpayouts request failed (attempt {attempt + 1}/{max_retries}): {e}")

            if attempt < max_retries - 1:
                delay = _RETRY_BASE_DELAY * (2 ** attempt)
                await asyncio.sleep(delay)

        logger.error(f"Travelpayouts collection failed after {max_retries} attempts: {origin}->{destination}")
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
        if price <= 0 or price > _MAX_PRICE_KRW:
            return None

        airline_code = offer.get("airline", "")
        if not airline_code or len(airline_code) != 2:
            return None

        duration_to = offer.get("duration_to")
        try:
            duration_minutes = int(duration_to) if duration_to else None
        except (ValueError, TypeError):
            duration_minutes = None

        return PriceObservation(
            observed_at=now,
            origin=origin,
            destination=destination,
            airline_code=airline_code,
            departure_date=departure_date,
            return_date=return_date,
            cabin_class=cabin_class,
            price=price,
            currency=_DEFAULT_CURRENCY,
            stops=stops,
            duration_minutes=duration_minutes,
            source=_SOURCE,
            raw_offer_id=None,
        )

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=_HEALTH_CHECK_TIMEOUT) as client:
                resp = await client.get(
                    f"{self.base_url}/v1/prices/cheap",
                    params={"origin": "ICN", "destination": "NRT", "token": self.token},
                )
                return resp.status_code == 200
        except httpx.HTTPError:
            return False
