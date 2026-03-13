from pathlib import Path

from pydantic_settings import BaseSettings

# Project root directory
PROJECT_ROOT = Path(__file__).parent.parent.parent

# SQLite database path
DB_PATH = PROJECT_ROOT / "data" / "farenheit.db"


class Settings(BaseSettings):
    # Database (SQLite)
    DATABASE_URL: str = f"sqlite+aiosqlite:///{DB_PATH}"

    # Travelpayouts API
    TRAVELPAYOUTS_TOKEN: str = ""
    TRAVELPAYOUTS_BASE_URL: str = "https://api.travelpayouts.com"

    # AirLabs API
    AIRLABS_API_KEY: str = ""
    AIRLABS_BASE_URL: str = "https://airlabs.co/api/v9"

    # Aviationstack API (LCC schedule fallback)
    AVIATIONSTACK_API_KEY: str = ""
    AVIATIONSTACK_BASE_URL: str = "http://api.aviationstack.com/v1"

    # Auth
    JWT_SECRET_KEY: str = "change-this-to-a-real-secret-key"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3100"]

    # Scheduler
    COLLECTION_INTERVAL_MINUTES: int = 30
    PREDICTION_INTERVAL_MINUTES: int = 60

    model_config = {"env_file": str(PROJECT_ROOT / ".env"), "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()

# Shared constants
VALID_CABIN_CLASSES = {"ECONOMY", "BUSINESS", "FIRST"}
CABIN_CLASS_ERROR_MSG = f"유효하지 않은 좌석 등급입니다. 유효한 값: {', '.join(sorted(VALID_CABIN_CLASSES))}"
IATA_CODE_CONSTRAINTS = {"min_length": 3, "max_length": 3, "pattern": r"^[A-Za-z]{3}$"}
SAME_ORIGIN_DEST_MSG = "출발지와 도착지가 같습니다."
DATE_PAST_MSG = "출발일은 오늘 또는 이후여야 합니다."
DATE_TOO_FAR_MSG = "출발일은 1년 이내여야 합니다."
RETURN_BEFORE_DEPART_MSG = "귀국일은 출발일 이후여야 합니다."
RETURN_DATE_TOO_FAR_MSG = "귀국일은 1년 이내여야 합니다."
MAX_FUTURE_DAYS = 365
