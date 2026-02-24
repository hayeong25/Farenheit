from sqlalchemy import select, or_, case, literal
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.airport import Airport
from app.models.route import Route
from app.schemas.route import RouteResponse, AirportSearchResponse

# Major international airports get priority in search results
MAJOR_AIRPORTS = {
    "ICN", "GMP", "PUS", "CJU", "TAE", "CJJ", "KWJ", "MWX",  # Korea
    "NRT", "HND", "KIX", "NGO", "FUK", "CTS", "OKA",  # Japan
    "PEK", "PKX", "PVG", "SHA", "CAN", "SZX", "HKG",  # China/HK
    "TPE", "TSA", "KHH",  # Taiwan
    "BKK", "SIN", "KUL", "SGN", "HAN", "DAD", "MNL", "CEB", "DPS",  # SE Asia
    "DEL", "BOM", "MLE", "CMB",  # South Asia
    "DXB", "DOH", "IST", "AUH",  # Middle East
    "LAX", "JFK", "SFO", "ORD", "SEA", "ATL", "MIA", "DEN", "LAS", "HNL",  # US
    "YVR", "YYZ",  # Canada
    "LHR", "CDG", "FRA", "AMS", "FCO", "MAD", "BCN", "MUC",  # Europe
    "ZRH", "VIE", "PRG", "BUD", "CPH", "ARN", "HEL", "DUB",
    "SYD", "MEL", "AKL", "GUM",  # Oceania
    "CAI", "JNB", "NBO",  # Africa
    "GRU", "CUN", "MEX",  # Americas
}


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
        search_term = f"%{query}%"
        starts_with = f"{query}%"

        # Priority scoring: lower = better
        # 1. city_ko starts with query (Korean city name starts with input)
        # 2. city starts with query (English city name starts with input)
        # 3. IATA code exact/starts with
        # 4. Everything else (contains match)
        priority = case(
            (Airport.iata_code.ilike(query), literal(0)),
            (Airport.city_ko.ilike(starts_with), literal(1)),
            (Airport.city.ilike(starts_with), literal(2)),
            (Airport.iata_code.ilike(starts_with), literal(3)),
            (Airport.name.ilike(starts_with), literal(4)),
            else_=literal(5),
        )

        # Major airport boost
        is_major = case(
            (Airport.iata_code.in_(MAJOR_AIRPORTS), literal(0)),
            else_=literal(1),
        )

        result = await self.db.execute(
            select(Airport)
            .where(
                or_(
                    Airport.iata_code.ilike(search_term),
                    Airport.name.ilike(search_term),
                    Airport.city.ilike(search_term),
                    Airport.city_ko.ilike(search_term),
                )
            )
            .order_by(priority, is_major, Airport.city)
            .limit(15)
        )
        airports = result.scalars().all()
        return [AirportSearchResponse.model_validate(a) for a in airports]
