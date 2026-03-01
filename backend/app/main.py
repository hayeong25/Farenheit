import logging
import time
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.api.router import api_router
from app.db.session import engine
from app.models.base import Base

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Security warning
    if settings.JWT_SECRET_KEY == "change-this-to-a-real-secret-key":
        logger.warning(
            "⚠️  JWT_SECRET_KEY is using the default value. "
            "Set a strong secret in .env for production!"
        )

    # Create all tables on startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Start background scheduler
    from app.scheduler import start_scheduler, stop_scheduler
    start_scheduler()

    yield

    stop_scheduler()
    await engine.dispose()


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.monotonic()
        response = await call_next(request)
        elapsed_ms = (time.monotonic() - start) * 1000
        if elapsed_ms > 1000:
            logger.warning(
                f"Slow request: {request.method} {request.url.path} "
                f"-> {response.status_code} ({elapsed_ms:.0f}ms)"
            )
        return response


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
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"],
    )

    app.add_middleware(RequestLoggingMiddleware)

    app.include_router(api_router, prefix="/api")

    return app


app = create_app()
