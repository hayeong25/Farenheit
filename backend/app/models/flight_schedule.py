from datetime import datetime

from sqlalchemy import Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, _utcnow


class FlightSchedule(Base):
    __tablename__ = "flight_schedules"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    origin_code: Mapped[str] = mapped_column(String(3))
    dest_code: Mapped[str] = mapped_column(String(3))
    airline_code: Mapped[str] = mapped_column(String(2))
    flight_iata: Mapped[str] = mapped_column(String(10))
    dep_time: Mapped[str] = mapped_column(String(5))  # "HH:MM"
    arr_time: Mapped[str] = mapped_column(String(5))  # "HH:MM"
    dep_terminal: Mapped[str | None] = mapped_column(String(10), default=None)
    arr_terminal: Mapped[str | None] = mapped_column(String(10), default=None)
    status: Mapped[str | None] = mapped_column(String(20), default=None)
    fetched_at: Mapped[datetime] = mapped_column(default=_utcnow)

    __table_args__ = (
        Index("idx_schedule_route", "origin_code", "dest_code"),
        Index("idx_schedule_airline_route", "airline_code", "origin_code", "dest_code"),
        Index("idx_schedule_route_fetched", "origin_code", "dest_code", "fetched_at"),
    )
