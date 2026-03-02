from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db

router = APIRouter()


@router.get("")
async def health_check(db: AsyncSession = Depends(get_db)) -> dict:
    try:
        await db.execute(text("SELECT 1"))
        db_status = "healthy"
    except SQLAlchemyError:
        db_status = "unhealthy"

    return {
        "status": "ok",
        "service": "farenheit-api",
        "version": "0.1.0",
        "database": db_status,
    }
