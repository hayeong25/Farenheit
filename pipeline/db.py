"""Shared database engine and session factory for pipeline tasks."""

from typing import Any

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from pipeline.config import pipeline_settings, DB_PATH

# Ensure data directory exists
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

# NullPool: no connection reuse across event loops.
# Required because BackgroundScheduler threads call asyncio.run() which creates
# a new event loop each time, making pooled connections loop-unsafe.
_engine = create_async_engine(pipeline_settings.DATABASE_URL, poolclass=NullPool)


# Enable SQLite foreign key enforcement on every connection
@event.listens_for(_engine.sync_engine, "connect")
def _set_sqlite_pragma(dbapi_connection: Any, connection_record: Any) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()


session_factory = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)
