from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Route(Base, TimestampMixin):
    __tablename__ = "routes"
    __table_args__ = (UniqueConstraint("origin_code", "dest_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    origin_code: Mapped[str] = mapped_column(String(3), ForeignKey("airports.iata_code"), index=True)
    dest_code: Mapped[str] = mapped_column(String(3), ForeignKey("airports.iata_code"), index=True)
    is_active: Mapped[bool] = mapped_column(default=True)
