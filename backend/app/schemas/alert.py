from datetime import date, datetime, timedelta
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
    def validate_alert(self) -> "AlertCreate":
        if self.origin.upper() == self.destination.upper():
            raise ValueError("출발지와 도착지가 같습니다.")
        if self.departure_date and self.departure_date < date.today():
            raise ValueError("출발일은 과거일 수 없습니다.")
        if self.departure_date and self.departure_date > date.today() + timedelta(days=365):
            raise ValueError("출발일은 1년 이내여야 합니다.")
        if self.target_price > 100_000_000:
            raise ValueError("목표 가격이 너무 큽니다.")
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
