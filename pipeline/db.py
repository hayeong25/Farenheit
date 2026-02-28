"""Shared database engine and session factory for pipeline tasks."""

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from pipeline.config import pipeline_settings

# NullPool: no connection reuse across event loops.
# Required because BackgroundScheduler threads call asyncio.run() which creates
# a new event loop each time, making pooled connections loop-unsafe.
_engine = create_async_engine(pipeline_settings.DATABASE_URL, poolclass=NullPool)
session_factory = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)
