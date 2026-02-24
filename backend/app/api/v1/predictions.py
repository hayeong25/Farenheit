from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.route import Route
from app.schemas.prediction import PredictionResponse, HeatmapResponse
from app.services.prediction_service import PredictionService

router = APIRouter()


@router.get("", response_model=PredictionResponse)
async def get_prediction(
    departure_date: date = Query(...),
    route_id: int | None = Query(None, description="Route ID (optional if origin/dest provided)"),
    origin: str | None = Query(None, min_length=3, max_length=3, pattern=r"^[A-Za-z]{3}$"),
    dest: str | None = Query(None, min_length=3, max_length=3, pattern=r"^[A-Za-z]{3}$"),
    cabin_class: str = Query("ECONOMY"),
    db: AsyncSession = Depends(get_db),
) -> PredictionResponse:
    # Normalize
    if origin:
        origin = origin.upper()
    if dest:
        dest = dest.upper()
    cabin_class = cabin_class.upper()

    # Resolve route_id from origin/dest if not provided
    if route_id is None and origin and dest:
        result = await db.execute(
            select(Route).where(Route.origin_code == origin, Route.dest_code == dest)
        )
        route = result.scalar_one_or_none()
        route_id = route.id if route else -1

    if route_id is None:
        route_id = -1

    service = PredictionService(db)
    return await service.get_prediction(route_id, departure_date, cabin_class)


@router.get("/heatmap", response_model=HeatmapResponse)
async def get_heatmap(
    origin: str = Query(..., min_length=3, max_length=3, pattern=r"^[A-Za-z]{3}$"),
    dest: str = Query(..., min_length=3, max_length=3, pattern=r"^[A-Za-z]{3}$"),
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$", description="Format: YYYY-MM"),
    db: AsyncSession = Depends(get_db),
) -> HeatmapResponse:
    origin = origin.upper()
    dest = dest.upper()
    service = PredictionService(db)
    return await service.get_heatmap(origin, dest, month)
