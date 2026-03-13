from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class RecommendationResponse(BaseModel):
    origin: str
    destination: str
    departure_date: date
    cabin_class: str
    signal: Literal["BUY", "WAIT", "HOLD", "INSUFFICIENT"]
    best_airline: str | None = None
    current_price: Decimal | None = Field(None, ge=0)
    predicted_low: Decimal | None = Field(None, ge=0)
    predicted_low_date: date | None = None
    confidence: Decimal | None = Field(None, ge=0, le=1)
    reasoning: str
