import logging

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.exc import SQLAlchemyError
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
        # Single query for all counts + timestamps
        result = (await db.execute(
            select(
                func.count().filter(Route.is_active.is_(True)).label("routes"),
            ).select_from(Route)
        )).one()
        routes_count = result.routes

        # Prices count + last collected in one query
        price_result = (await db.execute(
            select(
                func.count().label("cnt"),
                func.max(FlightPrice.time).label("last_time"),
            ).select_from(FlightPrice)
        )).one()

        # Predictions count + last predicted in one query
        pred_result = (await db.execute(
            select(
                func.count().label("cnt"),
                func.max(Prediction.predicted_at).label("last_at"),
            ).select_from(Prediction)
        )).one()

        airports_count = (await db.execute(
            select(func.count()).select_from(Airport)
        )).scalar() or 0

        return {
            "routes": routes_count,
            "prices": price_result.cnt or 0,
            "predictions": pred_result.cnt or 0,
            "airports": airports_count,
            "last_price_collected_at": price_result.last_time.isoformat() if price_result.last_time else None,
            "last_predicted_at": pred_result.last_at.isoformat() if pred_result.last_at else None,
        }
    except SQLAlchemyError as e:
        logger.error(f"Stats query failed: {e}", exc_info=True)
        return {
            "routes": 0,
            "prices": 0,
            "predictions": 0,
            "airports": 0,
            "last_price_collected_at": None,
            "last_predicted_at": None,
            "error": True,
        }
