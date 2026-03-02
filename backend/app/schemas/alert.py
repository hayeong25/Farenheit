from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.config import IATA_CODE_CONSTRAINTS


class AlertCreate(BaseModel):
    origin: str = Field(**IATA_CODE_CONSTRAINTS)
    destination: str = Field(**IATA_CODE_CONSTRAINTS)
    target_price: Decimal = Field(gt=0)
    cabin_class: Literal["ECONOMY", "BUSINESS", "FIRST"] = "ECONOMY"
    departure_date: date | None = None

    @model_validator(mode="after")
    def validate_alert(self) -> "AlertCreate":
        if self.origin.upper() == self.destination.upper():
            raise ValueError("출발지와 도착지가 같습니다.")
        today = datetime.now(timezone.utc).date()
        if self.departure_date and self.departure_date < today:
            raise ValueError("출발일은 과거일 수 없습니다.")
        if self.departure_date and self.departure_date > today + timedelta(days=365):
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
