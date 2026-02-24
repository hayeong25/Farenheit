"""Seed airport reference data into the database."""

import asyncio

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Major airports data
AIRPORTS = [
    ("ICN", "Incheon International Airport", "Seoul", "KR", 37.4602, 126.4407, "Asia/Seoul"),
    ("GMP", "Gimpo International Airport", "Seoul", "KR", 37.5583, 126.7906, "Asia/Seoul"),
    ("NRT", "Narita International Airport", "Tokyo", "JP", 35.7647, 140.3864, "Asia/Tokyo"),
    ("HND", "Haneda Airport", "Tokyo", "JP", 35.5494, 139.7798, "Asia/Tokyo"),
    ("KIX", "Kansai International Airport", "Osaka", "JP", 34.4347, 135.2441, "Asia/Tokyo"),
    ("PEK", "Beijing Capital International Airport", "Beijing", "CN", 40.0799, 116.6031, "Asia/Shanghai"),
    ("PVG", "Shanghai Pudong International Airport", "Shanghai", "CN", 31.1434, 121.8052, "Asia/Shanghai"),
    ("HKG", "Hong Kong International Airport", "Hong Kong", "HK", 22.3080, 113.9185, "Asia/Hong_Kong"),
    ("TPE", "Taiwan Taoyuan International Airport", "Taipei", "TW", 25.0777, 121.2325, "Asia/Taipei"),
    ("BKK", "Suvarnabhumi Airport", "Bangkok", "TH", 13.6900, 100.7501, "Asia/Bangkok"),
    ("SIN", "Singapore Changi Airport", "Singapore", "SG", 1.3644, 103.9915, "Asia/Singapore"),
    ("LAX", "Los Angeles International Airport", "Los Angeles", "US", 33.9425, -118.4081, "America/Los_Angeles"),
    ("JFK", "John F. Kennedy International Airport", "New York", "US", 40.6413, -73.7781, "America/New_York"),
    ("SFO", "San Francisco International Airport", "San Francisco", "US", 37.6213, -122.3790, "America/Los_Angeles"),
    ("ORD", "O'Hare International Airport", "Chicago", "US", 41.9742, -87.9073, "America/Chicago"),
    ("LHR", "London Heathrow Airport", "London", "GB", 51.4700, -0.4543, "Europe/London"),
    ("CDG", "Charles de Gaulle Airport", "Paris", "FR", 49.0097, 2.5479, "Europe/Paris"),
    ("FRA", "Frankfurt Airport", "Frankfurt", "DE", 50.0379, 8.5622, "Europe/Berlin"),
    ("DXB", "Dubai International Airport", "Dubai", "AE", 25.2532, 55.3657, "Asia/Dubai"),
    ("SYD", "Sydney Airport", "Sydney", "AU", -33.9461, 151.1772, "Australia/Sydney"),
]

# Major airlines
AIRLINES = [
    ("KE", "Korean Air", "KR"),
    ("OZ", "Asiana Airlines", "KR"),
    ("7C", "Jeju Air", "KR"),
    ("TW", "T'way Air", "KR"),
    ("LJ", "Jin Air", "KR"),
    ("BX", "Air Busan", "KR"),
    ("RS", "Air Seoul", "KR"),
    ("JL", "Japan Airlines", "JP"),
    ("NH", "All Nippon Airways", "JP"),
    ("MM", "Peach Aviation", "JP"),
    ("CA", "Air China", "CN"),
    ("MU", "China Eastern Airlines", "CN"),
    ("CX", "Cathay Pacific", "HK"),
    ("CI", "China Airlines", "TW"),
    ("BR", "EVA Air", "TW"),
    ("TG", "Thai Airways", "TH"),
    ("SQ", "Singapore Airlines", "SG"),
    ("AA", "American Airlines", "US"),
    ("UA", "United Airlines", "US"),
    ("DL", "Delta Air Lines", "US"),
    ("BA", "British Airways", "GB"),
    ("AF", "Air France", "FR"),
    ("LH", "Lufthansa", "DE"),
    ("EK", "Emirates", "AE"),
    ("QF", "Qantas", "AU"),
]

# Popular routes to seed
POPULAR_ROUTES = [
    ("ICN", "NRT"),
    ("ICN", "KIX"),
    ("ICN", "HND"),
    ("ICN", "PVG"),
    ("ICN", "PEK"),
    ("ICN", "HKG"),
    ("ICN", "TPE"),
    ("ICN", "BKK"),
    ("ICN", "SIN"),
    ("ICN", "LAX"),
    ("ICN", "JFK"),
    ("ICN", "SFO"),
    ("ICN", "LHR"),
    ("ICN", "CDG"),
    ("ICN", "FRA"),
    ("ICN", "DXB"),
    ("ICN", "SYD"),
    ("GMP", "HND"),
    ("GMP", "KIX"),
]


async def seed(database_url: str) -> None:
    """Seed airports, airlines, and routes."""
    # Import models here to ensure they're registered
    from backend.app.models.airport import Airport
    from backend.app.models.airline import Airline
    from backend.app.models.route import Route

    engine = create_async_engine(database_url)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as session:
        # Seed airports
        for iata, name, city, country, lat, lon, tz in AIRPORTS:
            airport = Airport(
                iata_code=iata,
                name=name,
                city=city,
                country_code=country,
                latitude=lat,
                longitude=lon,
                timezone=tz,
            )
            session.add(airport)

        # Seed airlines
        for iata, name, country in AIRLINES:
            airline = Airline(iata_code=iata, name=name, country_code=country)
            session.add(airline)

        await session.flush()

        # Seed routes
        for origin, dest in POPULAR_ROUTES:
            route = Route(origin_code=origin, dest_code=dest)
            session.add(route)

        await session.commit()

    await engine.dispose()
    print(f"Seeded {len(AIRPORTS)} airports, {len(AIRLINES)} airlines, {len(POPULAR_ROUTES)} routes")


if __name__ == "__main__":
    import sys

    url = sys.argv[1] if len(sys.argv) > 1 else "postgresql+asyncpg://farenheit:localdev@localhost:5432/farenheit"
    asyncio.run(seed(url))
