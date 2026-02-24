"""Seed airport, airline, and route reference data into the database."""

import asyncio
import sys
from pathlib import Path

# Add backend to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root / "backend"))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings, DB_PATH
from app.models.base import Base
from app.models.airport import Airport
from app.models.airline import Airline
from app.models.route import Route

# Major airports data: (iata, name, city, city_ko, country, lat, lon, tz)
AIRPORTS = [
    ("ICN", "Incheon International Airport", "Seoul", "서울/인천", "KR", 37.4602, 126.4407, "Asia/Seoul"),
    ("GMP", "Gimpo International Airport", "Seoul", "서울/김포", "KR", 37.5583, 126.7906, "Asia/Seoul"),
    ("NRT", "Narita International Airport", "Tokyo", "도쿄/나리타", "JP", 35.7647, 140.3864, "Asia/Tokyo"),
    ("HND", "Haneda Airport", "Tokyo", "도쿄/하네다", "JP", 35.5494, 139.7798, "Asia/Tokyo"),
    ("KIX", "Kansai International Airport", "Osaka", "오사카/간사이", "JP", 34.4347, 135.2441, "Asia/Tokyo"),
    ("PEK", "Beijing Capital International Airport", "Beijing", "베이징", "CN", 40.0799, 116.6031, "Asia/Shanghai"),
    ("PVG", "Shanghai Pudong International Airport", "Shanghai", "상하이/푸둥", "CN", 31.1434, 121.8052, "Asia/Shanghai"),
    ("HKG", "Hong Kong International Airport", "Hong Kong", "홍콩", "HK", 22.3080, 113.9185, "Asia/Hong_Kong"),
    ("TPE", "Taiwan Taoyuan International Airport", "Taipei", "타이베이/타오위안", "TW", 25.0777, 121.2325, "Asia/Taipei"),
    ("BKK", "Suvarnabhumi Airport", "Bangkok", "방콕", "TH", 13.6900, 100.7501, "Asia/Bangkok"),
    ("SIN", "Singapore Changi Airport", "Singapore", "싱가포르", "SG", 1.3644, 103.9915, "Asia/Singapore"),
    ("LAX", "Los Angeles International Airport", "Los Angeles", "로스앤젤레스", "US", 33.9425, -118.4081, "America/Los_Angeles"),
    ("JFK", "John F. Kennedy International Airport", "New York", "뉴욕", "US", 40.6413, -73.7781, "America/New_York"),
    ("SFO", "San Francisco International Airport", "San Francisco", "샌프란시스코", "US", 37.6213, -122.3790, "America/Los_Angeles"),
    ("ORD", "O'Hare International Airport", "Chicago", "시카고", "US", 41.9742, -87.9073, "America/Chicago"),
    ("LHR", "London Heathrow Airport", "London", "런던", "GB", 51.4700, -0.4543, "Europe/London"),
    ("CDG", "Charles de Gaulle Airport", "Paris", "파리", "FR", 49.0097, 2.5479, "Europe/Paris"),
    ("FRA", "Frankfurt Airport", "Frankfurt", "프랑크푸르트", "DE", 50.0379, 8.5622, "Europe/Berlin"),
    ("DXB", "Dubai International Airport", "Dubai", "두바이", "AE", 25.2532, 55.3657, "Asia/Dubai"),
    ("SYD", "Sydney Airport", "Sydney", "시드니", "AU", -33.9461, 151.1772, "Australia/Sydney"),
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


async def seed() -> None:
    """Seed airports, airlines, and routes."""
    # Ensure data directory exists
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    engine = create_async_engine(settings.DATABASE_URL, echo=False)

    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as session:
        # Check if already seeded
        result = await session.execute(select(Airport).limit(1))
        if result.scalar_one_or_none():
            print("Database already seeded. Skipping.")
            await engine.dispose()
            return

        # Seed airports
        for iata, name, city, city_ko, country, lat, lon, tz in AIRPORTS:
            session.add(Airport(
                iata_code=iata, name=name, city=city, city_ko=city_ko,
                country_code=country, latitude=lat, longitude=lon, timezone=tz,
            ))

        # Seed airlines
        for iata, name, country in AIRLINES:
            session.add(Airline(iata_code=iata, name=name, country_code=country))

        await session.flush()

        # Seed routes
        for origin, dest in POPULAR_ROUTES:
            session.add(Route(origin_code=origin, dest_code=dest))

        await session.commit()

    await engine.dispose()
    print(f"Seeded {len(AIRPORTS)} airports, {len(AIRLINES)} airlines, {len(POPULAR_ROUTES)} routes")


if __name__ == "__main__":
    asyncio.run(seed())
