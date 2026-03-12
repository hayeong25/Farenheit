from datetime import datetime, timedelta, timezone

from sqlalchemy import select, or_, case, literal, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.airport import Airport
from app.models.flight_price import FlightPrice
from app.models.route import Route
from app.schemas.route import RouteResponse, AirportSearchResponse

_RECENT_PRICE_DAYS = 7

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
        OriginAirport = aliased(Airport)
        DestAirport = aliased(Airport)

        result = await self.db.execute(
            select(
                Route,
                OriginAirport.city_ko.label("origin_city_ko"),
                OriginAirport.city.label("origin_city_en"),
                DestAirport.city_ko.label("dest_city_ko"),
                DestAirport.city.label("dest_city_en"),
            )
            .outerjoin(OriginAirport, Route.origin_code == OriginAirport.iata_code)
            .outerjoin(DestAirport, Route.dest_code == DestAirport.iata_code)
            .where(Route.is_active.is_(True))
            .order_by(Route.id)
            .limit(limit)
        )
        rows = result.all()
        if not rows:
            return []

        route_ids = [row[0].id for row in rows]

        # Batch fetch min prices for all routes (recent 7 days)
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        cutoff = now - timedelta(days=_RECENT_PRICE_DAYS)
        price_result = await self.db.execute(
            select(
                FlightPrice.route_id,
                func.min(FlightPrice.price_amount).label("min_price"),
            )
            .where(
                FlightPrice.route_id.in_(route_ids),
                FlightPrice.time >= cutoff,
                FlightPrice.price_amount > 0,
            )
            .group_by(FlightPrice.route_id)
        )
        price_map: dict[int, float] = {}
        for pr in price_result.all():
            price_map[pr.route_id] = float(pr.min_price)

        responses = []
        for row in rows:
            route = row[0]
            origin_city = row.origin_city_ko or row.origin_city_en
            dest_city = row.dest_city_ko or row.dest_city_en
            responses.append(RouteResponse(
                id=route.id,
                origin_code=route.origin_code,
                dest_code=route.dest_code,
                origin_city=origin_city,
                dest_city=dest_city,
                is_active=route.is_active,
                min_price=price_map.get(route.id),
            ))
        return responses

    async def search_airports(self, query: str) -> list[AirportSearchResponse]:
        query = query.strip()
        if not query:
            return []
        # Escape LIKE special characters
        escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        search_term = f"%{escaped}%"
        starts_with = f"{escaped}%"

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
