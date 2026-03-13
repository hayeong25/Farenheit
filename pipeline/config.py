from pathlib import Path

from pydantic_settings import BaseSettings

PROJECT_ROOT = Path(__file__).parent.parent
DB_PATH = PROJECT_ROOT / "data" / "farenheit.db"


class PipelineSettings(BaseSettings):
    # Database (SQLite)
    DATABASE_URL: str = f"sqlite+aiosqlite:///{DB_PATH}"

    # Travelpayouts API
    TRAVELPAYOUTS_TOKEN: str = ""
    TRAVELPAYOUTS_BASE_URL: str = "https://api.travelpayouts.com"

    # Collection settings
    COLLECTION_BATCH_SIZE: int = 10
    MAX_RETRIES: int = 3

    model_config = {"env_file": str(PROJECT_ROOT / ".env"), "env_file_encoding": "utf-8", "extra": "ignore"}


pipeline_settings = PipelineSettings()
