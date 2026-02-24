from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.recommendation import RecommendationResponse
from app.services.recommendation_service import RecommendationService

router = APIRouter()


@router.get("", response_model=RecommendationResponse)
async def get_recommendation(
    origin: str = Query(..., min_length=3, max_length=3),
    dest: str = Query(..., min_length=3, max_length=3),
    departure_date: date = Query(...),
    cabin_class: str = Query("ECONOMY"),
    db: AsyncSession = Depends(get_db),
) -> RecommendationResponse:
    service = RecommendationService(db)
    return await service.get_recommendation(origin, dest, departure_date, cabin_class)
