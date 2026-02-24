from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.route import RouteResponse, AirportSearchResponse
from app.services.route_service import RouteService

router = APIRouter()


@router.get("/popular", response_model=list[RouteResponse])
async def get_popular_routes(
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> list[RouteResponse]:
    service = RouteService(db)
    return await service.get_popular_routes(limit)


@router.get("/airports/search", response_model=list[AirportSearchResponse])
async def search_airports(
    q: str = Query(..., min_length=1, max_length=50),
    db: AsyncSession = Depends(get_db),
) -> list[AirportSearchResponse]:
    service = RouteService(db)
    return await service.search_airports(q)
