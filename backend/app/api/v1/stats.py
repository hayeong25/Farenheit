from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.route import Route
from app.models.flight_price import FlightPrice
from app.models.prediction import Prediction
from app.models.airport import Airport

router = APIRouter()


@router.get("")
async def get_stats(db: AsyncSession = Depends(get_db)) -> dict:
    routes_count = (await db.execute(
        select(func.count()).select_from(Route).where(Route.is_active.is_(True))
    )).scalar() or 0

    prices_count = (await db.execute(
        select(func.count()).select_from(FlightPrice)
    )).scalar() or 0

    predictions_count = (await db.execute(
        select(func.count()).select_from(Prediction)
    )).scalar() or 0

    airports_count = (await db.execute(
        select(func.count()).select_from(Airport)
    )).scalar() or 0

    return {
        "routes": routes_count,
        "prices": prices_count,
        "predictions": predictions_count,
        "airports": airports_count,
    }
