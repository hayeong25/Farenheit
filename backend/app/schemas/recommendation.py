from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class RecommendationResponse(BaseModel):
    origin: str
    destination: str
    departure_date: date
    cabin_class: str
    signal: str  # BUY, WAIT, HOLD
    best_airline: str | None = None
    current_price: Decimal | None = None
    predicted_low: Decimal | None = None
    predicted_low_date: date | None = None
    confidence: Decimal | None = None
    reasoning: str
