from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, model_validator


class FlightOffer(BaseModel):
    airline_code: str
    airline_name: str | None = None
    departure_date: date
    return_date: date | None = None
    cabin_class: str
    price_amount: Decimal = Field(gt=0)
    currency: str
    stops: int = Field(ge=0)
    duration_minutes: int | None = Field(None, ge=0)
    source: str
    departure_time: str | None = None
    arrival_time: str | None = None
    flight_number: str | None = None
    # Return leg info (round-trip only)
    return_flight_number: str | None = None
    return_departure_time: str | None = None
    return_arrival_time: str | None = None
    return_stops: int | None = Field(None, ge=0)
    return_duration_minutes: int | None = Field(None, ge=0)

    @model_validator(mode="after")
    def _clear_return_fields_for_one_way(self) -> "FlightOffer":
        if not self.return_date:
            self.return_flight_number = None
            self.return_departure_time = None
            self.return_arrival_time = None
            self.return_stops = None
            self.return_duration_minutes = None
        return self


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
    route_id: int | None = None
    data_source: str = "live"  # "live" (API) or "cached" (DB fallback)


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
