from datetime import date

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class UserWatchlist(Base, TimestampMixin):
    __tablename__ = "user_watchlist"
    __table_args__ = (
        UniqueConstraint("user_id", "route_id", "departure_date_start", "cabin_class"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id"))
    departure_date_start: Mapped[date | None] = mapped_column()
    departure_date_end: Mapped[date | None] = mapped_column()
    cabin_class: Mapped[str] = mapped_column(String(20), default="ECONOMY")
