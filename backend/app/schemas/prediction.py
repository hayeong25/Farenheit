from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class ForecastPoint(BaseModel):
    date: date
    predicted_price: Decimal = Field(ge=0)
    confidence_low: Decimal = Field(ge=0)
    confidence_high: Decimal = Field(ge=0)


class PredictionResponse(BaseModel):
    route_id: int
    departure_date: date
    cabin_class: str
    predicted_price: Decimal | None = Field(None, ge=0)
    confidence_low: Decimal | None = Field(None, ge=0)
    confidence_high: Decimal | None = Field(None, ge=0)
    price_direction: Literal["UP", "DOWN", "STABLE"]
    confidence_score: Decimal | None = Field(None, ge=0, le=1)
    model_version: str
    predicted_at: datetime | None
    forecast_series: list[ForecastPoint] = []


class HeatmapCell(BaseModel):
    departure_date: date
    weeks_before: int = Field(ge=0)
    predicted_price: Decimal = Field(ge=0)
    price_level: Literal["LOW", "MEDIUM", "HIGH"]


class HeatmapResponse(BaseModel):
    origin: str
    destination: str
    month: str
    cells: list[HeatmapCell]
