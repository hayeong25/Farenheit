from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.prediction import PredictionResponse, HeatmapResponse
from app.services.prediction_service import PredictionService

router = APIRouter()


@router.get("", response_model=PredictionResponse)
async def get_prediction(
    route_id: int = Query(...),
    departure_date: date = Query(...),
    cabin_class: str = Query("ECONOMY"),
    db: AsyncSession = Depends(get_db),
) -> PredictionResponse:
    service = PredictionService(db)
    return await service.get_prediction(route_id, departure_date, cabin_class)


@router.get("/heatmap", response_model=HeatmapResponse)
async def get_heatmap(
    origin: str = Query(..., min_length=3, max_length=3),
    dest: str = Query(..., min_length=3, max_length=3),
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$", description="Format: YYYY-MM"),
    db: AsyncSession = Depends(get_db),
) -> HeatmapResponse:
    service = PredictionService(db)
    return await service.get_heatmap(origin, dest, month)
