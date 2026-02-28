from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class AlertCreate(BaseModel):
    origin: str = Field(min_length=3, max_length=3, pattern=r"^[A-Za-z]{3}$")
    destination: str = Field(min_length=3, max_length=3, pattern=r"^[A-Za-z]{3}$")
    target_price: Decimal = Field(gt=0)
    cabin_class: Literal["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"] = "ECONOMY"
    departure_date: date | None = None

    @model_validator(mode="after")
    def validate_departure_not_past(self) -> "AlertCreate":
        if self.departure_date and self.departure_date < date.today():
            raise ValueError("출발일은 과거일 수 없습니다.")
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
