from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class FlightPrice(Base):
    __tablename__ = "flight_prices"
    __table_args__ = (
        Index("idx_fp_route_depart", "route_id", "departure_date", "time"),
        Index("idx_fp_airline_route", "airline_code", "route_id", "time"),
    )

    time: Mapped[datetime] = mapped_column(primary_key=True)
    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id"), primary_key=True)
    airline_code: Mapped[str] = mapped_column(
        String(2), ForeignKey("airlines.iata_code"), primary_key=True
    )
    departure_date: Mapped[date] = mapped_column(primary_key=True)
    cabin_class: Mapped[str] = mapped_column(String(20), primary_key=True, default="ECONOMY")
    return_date: Mapped[date | None] = mapped_column()
    price_amount: Mapped[Decimal] = mapped_column()
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    stops: Mapped[int] = mapped_column(default=0)
    duration_minutes: Mapped[int | None] = mapped_column()
    source: Mapped[str] = mapped_column(String(50))
    raw_offer_id: Mapped[str | None] = mapped_column(String(255))
