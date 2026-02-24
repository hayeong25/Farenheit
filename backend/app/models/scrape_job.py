from datetime import datetime

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ScrapeJob(Base):
    __tablename__ = "scrape_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_type: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="PENDING")
    route_id: Mapped[int | None] = mapped_column(ForeignKey("routes.id"))
    started_at: Mapped[datetime | None] = mapped_column()
    finished_at: Mapped[datetime | None] = mapped_column()
    error_msg: Mapped[str | None] = mapped_column(Text)
    records_collected: Mapped[int] = mapped_column(default=0)
    celery_task_id: Mapped[str | None] = mapped_column(String(255))
