from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class ForecastPoint(BaseModel):
    date: date
    predicted_price: Decimal
    confidence_low: Decimal
    confidence_high: Decimal


class PredictionResponse(BaseModel):
    route_id: int
    departure_date: date
    cabin_class: str
    predicted_price: Decimal
    confidence_low: Decimal | None
    confidence_high: Decimal | None
    price_direction: str  # UP, DOWN, STABLE
    confidence_score: Decimal | None
    model_version: str
    predicted_at: datetime
    forecast_series: list[ForecastPoint] = []


class HeatmapCell(BaseModel):
    departure_date: date
    weeks_before: int
    predicted_price: Decimal
    price_level: str  # LOW, MEDIUM, HIGH


class HeatmapResponse(BaseModel):
    origin: str
    destination: str
    month: str
    cells: list[HeatmapCell]
