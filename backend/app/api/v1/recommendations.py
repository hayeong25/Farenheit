from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import VALID_CABIN_CLASSES, CABIN_CLASS_ERROR_MSG
from app.db.session import get_db
from app.schemas.recommendation import RecommendationResponse
from app.services.recommendation_service import RecommendationService

router = APIRouter()


@router.get("", response_model=RecommendationResponse)
async def get_recommendation(
    origin: str = Query(..., min_length=3, max_length=3, pattern=r"^[A-Za-z]{3}$"),
    dest: str = Query(..., min_length=3, max_length=3, pattern=r"^[A-Za-z]{3}$"),
    departure_date: date = Query(...),
    cabin_class: str = Query("ECONOMY"),
    db: AsyncSession = Depends(get_db),
) -> RecommendationResponse:
    origin = origin.upper()
    dest = dest.upper()
    cabin_class = cabin_class.upper()
    if cabin_class not in VALID_CABIN_CLASSES:
        raise HTTPException(status_code=400, detail=CABIN_CLASS_ERROR_MSG)
    if origin == dest:
        raise HTTPException(status_code=400, detail="출발지와 도착지가 같습니다.")
    today = datetime.now(timezone.utc).date()
    if departure_date < today:
        raise HTTPException(status_code=400, detail="출발일은 오늘 또는 이후여야 합니다.")
    if departure_date > today + timedelta(days=365):
        raise HTTPException(status_code=400, detail="출발일은 1년 이내여야 합니다.")
    service = RecommendationService(db)
    return await service.get_recommendation(origin, dest, departure_date, cabin_class)
