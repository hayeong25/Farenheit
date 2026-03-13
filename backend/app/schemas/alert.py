from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.config import IATA_CODE_CONSTRAINTS, SAME_ORIGIN_DEST_MSG, DATE_PAST_MSG, DATE_TOO_FAR_MSG, PRICE_TOO_HIGH_MSG, MAX_FUTURE_DAYS

_MAX_TARGET_PRICE = 100_000_000


class AlertCreate(BaseModel):
    origin: str = Field(**IATA_CODE_CONSTRAINTS)
    destination: str = Field(**IATA_CODE_CONSTRAINTS)
    target_price: Decimal = Field(gt=0)
    cabin_class: Literal["ECONOMY", "BUSINESS", "FIRST"] = "ECONOMY"
    departure_date: date | None = None

    @model_validator(mode="after")
    def validate_alert(self) -> "AlertCreate":
        self.origin = self.origin.upper()
        self.destination = self.destination.upper()
        if self.origin == self.destination:
            raise ValueError(SAME_ORIGIN_DEST_MSG)
        today = datetime.now(timezone.utc).date()
        if self.departure_date and self.departure_date < today:
            raise ValueError(DATE_PAST_MSG)
        if self.departure_date and self.departure_date > today + timedelta(days=MAX_FUTURE_DAYS):
            raise ValueError(DATE_TOO_FAR_MSG)
        if self.target_price > _MAX_TARGET_PRICE:
            raise ValueError(PRICE_TOO_HIGH_MSG)
        return self


class AlertResponse(BaseModel):
    id: int
    route_id: int
    origin: str | None = None
    destination: str | None = None
    target_price: Decimal
    cabin_class: str
    departure_date: date | None
    is_triggered: bool
    triggered_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
