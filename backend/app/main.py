from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api.router import api_router
from app.db.session import engine
from app.models.base import Base


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Create all tables on startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Start background scheduler
    from app.scheduler import start_scheduler, stop_scheduler
    start_scheduler()

    yield

    stop_scheduler()
    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Farenheit API",
        description="항공권 가격 변동 예측 및 최적 구매 시기 추천 시스템",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router, prefix="/api")

    return app


app = create_app()
