from decimal import Decimal

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Airport(Base):
    __tablename__ = "airports"

    iata_code: Mapped[str] = mapped_column(String(3), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    city: Mapped[str] = mapped_column(String(100))
    country_code: Mapped[str] = mapped_column(String(2))
    latitude: Mapped[Decimal | None] = mapped_column()
    longitude: Mapped[Decimal | None] = mapped_column()
    timezone: Mapped[str | None] = mapped_column(String(50))
