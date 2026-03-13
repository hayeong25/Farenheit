from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import VALID_CABIN_CLASSES, CABIN_CLASS_ERROR_MSG, IATA_CODE_CONSTRAINTS, SAME_ORIGIN_DEST_MSG, DATE_PAST_MSG, DATE_TOO_FAR_MSG, MAX_FUTURE_DAYS
from app.db.session import get_db
from app.schemas.recommendation import RecommendationResponse
from app.services.recommendation_service import RecommendationService

router = APIRouter()


@router.get("", response_model=RecommendationResponse)
async def get_recommendation(
    origin: str = Query(..., **IATA_CODE_CONSTRAINTS),
    dest: str = Query(..., **IATA_CODE_CONSTRAINTS),
    departure_date: date = Query(...),
    cabin_class: str = Query("ECONOMY"),
    db: AsyncSession = Depends(get_db),
) -> RecommendationResponse:
    origin = origin.upper()
    dest = dest.upper()
    cabin_class = cabin_class.upper()
    if cabin_class not in VALID_CABIN_CLASSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=CABIN_CLASS_ERROR_MSG)
    if origin == dest:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=SAME_ORIGIN_DEST_MSG)
    today = datetime.now(timezone.utc).date()
    if departure_date < today:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=DATE_PAST_MSG)
    if departure_date > today + timedelta(days=MAX_FUTURE_DAYS):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=DATE_TOO_FAR_MSG)
    service = RecommendationService(db)
    return await service.get_recommendation(origin, dest, departure_date, cabin_class)
