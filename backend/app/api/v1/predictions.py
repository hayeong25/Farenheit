from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import VALID_CABIN_CLASSES
from app.db.session import get_db
from app.models.route import Route
from app.schemas.prediction import PredictionResponse, HeatmapResponse
from app.services.prediction_service import PredictionService

router = APIRouter()


@router.get("", response_model=PredictionResponse)
async def get_prediction(
    departure_date: date = Query(...),
    route_id: int | None = Query(None, ge=1, description="Route ID (optional if origin/dest provided)"),
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
    if cabin_class not in VALID_CABIN_CLASSES:
        raise HTTPException(status_code=400, detail=f"유효하지 않은 좌석 등급입니다. ({', '.join(sorted(VALID_CABIN_CLASSES))})")
    if origin and dest and origin == dest:
        raise HTTPException(status_code=400, detail="출발지와 도착지가 같습니다.")
    if departure_date < date.today():
        raise HTTPException(status_code=400, detail="출발일은 오늘 또는 이후여야 합니다.")
    if departure_date > date.today() + timedelta(days=365):
        raise HTTPException(status_code=400, detail="출발일은 1년 이내여야 합니다.")

    # Resolve route_id from origin/dest if not provided
    if route_id is None and origin and dest:
        result = await db.execute(
            select(Route).where(Route.origin_code == origin, Route.dest_code == dest)
        )
        route = result.scalar_one_or_none()
        route_id = route.id if route else None

    service = PredictionService(db)
    if route_id is None:
        return PredictionResponse(
            route_id=0,
            departure_date=departure_date,
            cabin_class=cabin_class,
            predicted_price=None,
            confidence_low=None,
            confidence_high=None,
            price_direction="STABLE",
            confidence_score=None,
            model_version="none",
            predicted_at=None,
            forecast_series=[],
        )

    return await service.get_prediction(route_id, departure_date, cabin_class)


@router.get("/heatmap", response_model=HeatmapResponse)
async def get_heatmap(
    origin: str = Query(..., min_length=3, max_length=3, pattern=r"^[A-Za-z]{3}$"),
    dest: str = Query(..., min_length=3, max_length=3, pattern=r"^[A-Za-z]{3}$"),
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$", description="Format: YYYY-MM"),
    cabin_class: str = Query("ECONOMY"),
    db: AsyncSession = Depends(get_db),
) -> HeatmapResponse:
    origin = origin.upper()
    dest = dest.upper()
    cabin_class = cabin_class.upper()
    if cabin_class not in VALID_CABIN_CLASSES:
        raise HTTPException(status_code=400, detail=f"유효하지 않은 좌석 등급입니다. ({', '.join(sorted(VALID_CABIN_CLASSES))})")
    if origin == dest:
        raise HTTPException(status_code=400, detail="출발지와 도착지가 같습니다.")
    # Validate month semantics (YYYY-MM format already guaranteed by regex)
    try:
        year_val, mon_val = int(month[:4]), int(month[5:7])
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="유효하지 않은 월 형식입니다.")
    if not (2020 <= year_val <= 2099 and 1 <= mon_val <= 12):
        raise HTTPException(status_code=400, detail="유효하지 않은 월 형식입니다.")
    service = PredictionService(db)
    return await service.get_heatmap(origin, dest, month, cabin_class)
