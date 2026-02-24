from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.flight import FlightSearchResponse, PriceHistoryResponse
from app.services.flight_service import FlightService

router = APIRouter()


@router.get("/search", response_model=FlightSearchResponse)
async def search_flights(
    origin: str = Query(..., min_length=3, max_length=3, description="Origin IATA code"),
    dest: str = Query(..., min_length=3, max_length=3, description="Destination IATA code"),
    departure_date: date = Query(..., description="Departure date"),
    cabin_class: str = Query("ECONOMY", description="Cabin class"),
    max_stops: int | None = Query(None, ge=0, le=3, description="Max stops filter"),
    sort_by: str = Query("price", description="Sort by: price, duration, stops"),
    db: AsyncSession = Depends(get_db),
) -> FlightSearchResponse:
    service = FlightService(db)
    return await service.search(origin, dest, departure_date, cabin_class, max_stops, sort_by)


@router.get("/prices/history", response_model=PriceHistoryResponse)
async def price_history(
    route_id: int = Query(...),
    departure_date: date = Query(...),
    airline_code: str | None = Query(None),
    days: int = Query(30, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
) -> PriceHistoryResponse:
    service = FlightService(db)
    return await service.get_price_history(route_id, departure_date, airline_code, days)
