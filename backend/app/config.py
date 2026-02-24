import os
from pathlib import Path

from pydantic_settings import BaseSettings

# Project root directory
PROJECT_ROOT = Path(__file__).parent.parent.parent

# SQLite database path
DB_PATH = PROJECT_ROOT / "data" / "farenheit.db"


class Settings(BaseSettings):
    # Database (SQLite)
    DATABASE_URL: str = f"sqlite+aiosqlite:///{DB_PATH}"

    # Amadeus API
    AMADEUS_CLIENT_ID: str = ""
    AMADEUS_CLIENT_SECRET: str = ""
    AMADEUS_BASE_URL: str = "https://test.api.amadeus.com"

    # Auth
    JWT_SECRET_KEY: str = "change-this-to-a-real-secret-key"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # Scheduler
    COLLECTION_INTERVAL_MINUTES: int = 30
    PREDICTION_INTERVAL_MINUTES: int = 60

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
