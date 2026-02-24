from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class FlightOffer(BaseModel):
    airline_code: str
    airline_name: str | None = None
    departure_date: date
    return_date: date | None = None
    cabin_class: str
    price_amount: Decimal
    currency: str
    stops: int
    duration_minutes: int | None = None
    source: str
    departure_time: str | None = None
    arrival_time: str | None = None
    # Return leg info (round-trip only)
    return_departure_time: str | None = None
    return_arrival_time: str | None = None
    return_stops: int | None = None
    return_duration_minutes: int | None = None


class AirlineInfo(BaseModel):
    code: str
    name: str


class FlightSearchResponse(BaseModel):
    origin: str
    destination: str
    departure_date: date
    return_date: date | None = None
    trip_type: str = "one_way"
    cabin_class: str
    offers: list[FlightOffer]
    total_count: int
    available_airlines: list[AirlineInfo] = []


class PricePoint(BaseModel):
    time: datetime
    price_amount: Decimal
    airline_code: str
    source: str


class PriceHistoryResponse(BaseModel):
    route_id: int
    departure_date: date
    airline_code: str | None
    prices: list[PricePoint]
    min_price: Decimal | None = None
    max_price: Decimal | None = None
    avg_price: Decimal | None = None
