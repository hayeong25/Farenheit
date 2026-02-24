import os
from pathlib import Path

from pydantic_settings import BaseSettings

PROJECT_ROOT = Path(__file__).parent.parent
DB_PATH = PROJECT_ROOT / "data" / "farenheit.db"


class PipelineSettings(BaseSettings):
    # Database (SQLite)
    DATABASE_URL: str = f"sqlite+aiosqlite:///{DB_PATH}"

    # Amadeus API
    AMADEUS_CLIENT_ID: str = ""
    AMADEUS_CLIENT_SECRET: str = ""
    AMADEUS_BASE_URL: str = "https://test.api.amadeus.com"

    # Collection settings
    COLLECTION_BATCH_SIZE: int = 10
    MAX_RETRIES: int = 3

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


pipeline_settings = PipelineSettings()
