from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal


@dataclass
class PriceObservation:
    """Normalized price data point from any source."""

    observed_at: datetime
    origin: str
    destination: str
    airline_code: str
    departure_date: date
    return_date: date | None
    cabin_class: str
    price: Decimal
    currency: str
    stops: int
    duration_minutes: int | None
    source: str
    raw_offer_id: str | None


class AbstractCollector(ABC):
    """Base class for all price data collectors."""

    @abstractmethod
    async def collect(
        self,
        origin: str,
        destination: str,
        departure_date: date,
        return_date: date | None = None,
        cabin_class: str = "ECONOMY",
    ) -> list[PriceObservation]:
        """Collect price observations for a given route and date."""
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        """Check if the collector source is reachable."""
        ...
