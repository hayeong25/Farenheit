from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Prediction(Base):
    __tablename__ = "predictions"
    __table_args__ = (
        UniqueConstraint(
            "route_id", "airline_code", "departure_date", "cabin_class", "model_version"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id"), index=True)
    airline_code: Mapped[str | None] = mapped_column(String(2), ForeignKey("airlines.iata_code"))
    departure_date: Mapped[date] = mapped_column()
    cabin_class: Mapped[str] = mapped_column(String(20), default="ECONOMY")
    predicted_price: Mapped[Decimal] = mapped_column()
    confidence_low: Mapped[Decimal | None] = mapped_column()
    confidence_high: Mapped[Decimal | None] = mapped_column()
    price_direction: Mapped[str] = mapped_column(String(10))  # UP, DOWN, STABLE
    confidence_score: Mapped[Decimal | None] = mapped_column()
    model_version: Mapped[str] = mapped_column(String(50))
    predicted_at: Mapped[datetime] = mapped_column(default=func.now())
    valid_until: Mapped[datetime] = mapped_column()
