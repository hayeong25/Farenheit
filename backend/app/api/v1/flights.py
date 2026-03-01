from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import VALID_CABIN_CLASSES, CABIN_CLASS_ERROR_MSG
from app.db.session import get_db
from app.schemas.flight import FlightSearchResponse, PriceHistoryResponse
from app.services.flight_service import FlightService

router = APIRouter()
VALID_SORT_OPTIONS = {"price", "duration", "stops"}


@router.get("/search", response_model=FlightSearchResponse)
async def search_flights(
    origin: str = Query(..., min_length=3, max_length=3, pattern=r"^[A-Za-z]{3}$", description="Origin IATA code"),
    dest: str = Query(..., min_length=3, max_length=3, pattern=r"^[A-Za-z]{3}$", description="Destination IATA code"),
    departure_date: date = Query(..., description="Departure date"),
    return_date: date | None = Query(None, description="Return date for round-trip"),
    cabin_class: str = Query("ECONOMY", description="Cabin class"),
    max_stops: int | None = Query(None, ge=0, le=3, description="Max stops filter"),
    sort_by: str = Query("price", description="Sort by: price, duration, stops"),
    db: AsyncSession = Depends(get_db),
) -> FlightSearchResponse:
    # Normalize IATA codes to uppercase
    origin = origin.upper()
    dest = dest.upper()

    if origin == dest:
        raise HTTPException(status_code=400, detail="출발지와 도착지가 같습니다.")

    today = datetime.now(timezone.utc).date()
    if departure_date < today:
        raise HTTPException(status_code=400, detail="출발일은 오늘 또는 이후여야 합니다.")

    if return_date and return_date < departure_date:
        raise HTTPException(status_code=400, detail="귀국일은 출발일 이후여야 합니다.")

    max_date = today + timedelta(days=365)
    if departure_date > max_date:
        raise HTTPException(status_code=400, detail="출발일은 1년 이내여야 합니다.")
    if return_date and return_date > max_date:
        raise HTTPException(status_code=400, detail="귀국일은 1년 이내여야 합니다.")

    cabin_class = cabin_class.upper()
    if cabin_class not in VALID_CABIN_CLASSES:
        raise HTTPException(status_code=400, detail=CABIN_CLASS_ERROR_MSG)

    if sort_by not in VALID_SORT_OPTIONS:
        sort_by = "price"

    service = FlightService(db)
    return await service.search(
        origin, dest, departure_date, cabin_class,
        max_stops, sort_by, return_date=return_date,
    )


@router.get("/prices/history", response_model=PriceHistoryResponse)
async def price_history(
    route_id: int = Query(..., ge=1),
    departure_date: date = Query(...),
    airline_code: str | None = Query(None, max_length=2, pattern=r"^[A-Za-z0-9]{2}$"),
    days: int = Query(30, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
) -> PriceHistoryResponse:
    if airline_code:
        airline_code = airline_code.upper()
    service = FlightService(db)
    return await service.get_price_history(route_id, departure_date, airline_code, days)
