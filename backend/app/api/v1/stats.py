import logging

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.route import Route
from app.models.flight_price import FlightPrice
from app.models.prediction import Prediction
from app.models.airport import Airport

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("")
async def get_stats(db: AsyncSession = Depends(get_db)) -> dict:
    try:
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

        last_collected = (await db.execute(
            select(func.max(FlightPrice.time))
        )).scalar()

        last_predicted = (await db.execute(
            select(func.max(Prediction.predicted_at))
        )).scalar()

        return {
            "routes": routes_count,
            "prices": prices_count,
            "predictions": predictions_count,
            "airports": airports_count,
            "last_price_collected_at": last_collected.isoformat() if last_collected else None,
            "last_predicted_at": last_predicted.isoformat() if last_predicted else None,
        }
    except Exception as e:
        logger.error(f"Stats query failed: {e}")
        return {
            "routes": 0,
            "prices": 0,
            "predictions": 0,
            "airports": 0,
            "last_price_collected_at": None,
            "last_predicted_at": None,
        }
