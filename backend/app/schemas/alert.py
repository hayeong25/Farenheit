from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class AlertCreate(BaseModel):
    route_id: int
    target_price: Decimal
    cabin_class: str = "ECONOMY"
    departure_date: date | None = None


class AlertResponse(BaseModel):
    id: int
    route_id: int
    target_price: Decimal
    cabin_class: str
    departure_date: date | None
    is_triggered: bool
    triggered_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
