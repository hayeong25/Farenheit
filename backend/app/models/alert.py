from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class PriceAlert(Base, TimestampMixin):
    __tablename__ = "price_alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id"))
    target_price: Mapped[Decimal] = mapped_column()
    cabin_class: Mapped[str] = mapped_column(String(20), default="ECONOMY")
    departure_date: Mapped[date | None] = mapped_column()
    is_triggered: Mapped[bool] = mapped_column(default=False)
    triggered_at: Mapped[datetime | None] = mapped_column()
