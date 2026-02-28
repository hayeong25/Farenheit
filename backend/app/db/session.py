from collections.abc import AsyncIterator
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.config import settings, DB_PATH

# Ensure data directory exists
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

# StaticPool: single connection reused across async tasks (safe for SQLite + aiosqlite)
engine = create_async_engine(settings.DATABASE_URL, echo=False, poolclass=StaticPool)

async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
