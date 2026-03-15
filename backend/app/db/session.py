import logging
from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.config import settings, DB_PATH

logger = logging.getLogger(__name__)

# Ensure data directory exists
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

# StaticPool: single connection reused across async tasks (safe for SQLite + aiosqlite)
engine = create_async_engine(settings.DATABASE_URL, echo=False, poolclass=StaticPool)


# Enable SQLite foreign key enforcement on every connection
@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_pragma(dbapi_connection: Any, connection_record: Any) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()

async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception as e:
            logger.warning(f"Session rollback after exception: {type(e).__name__}: {e}")
            await session.rollback()
            raise
