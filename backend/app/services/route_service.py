from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.airport import Airport
from app.models.route import Route
from app.schemas.route import RouteResponse, AirportSearchResponse


class RouteService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_popular_routes(self, limit: int) -> list[RouteResponse]:
        result = await self.db.execute(
            select(Route).where(Route.is_active.is_(True)).limit(limit)
        )
        routes = result.scalars().all()
        return [RouteResponse.model_validate(r) for r in routes]

    async def search_airports(self, query: str) -> list[AirportSearchResponse]:
        search_term = f"%{query.upper()}%"
        result = await self.db.execute(
            select(Airport)
            .where(
                or_(
                    Airport.iata_code.ilike(search_term),
                    Airport.name.ilike(search_term),
                    Airport.city.ilike(search_term),
                )
            )
            .limit(10)
        )
        airports = result.scalars().all()
        return [AirportSearchResponse.model_validate(a) for a in airports]
