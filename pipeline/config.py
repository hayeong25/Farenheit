from pydantic_settings import BaseSettings


class PipelineSettings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://farenheit:localdev@localhost:5432/farenheit"

    # Redis / Celery broker
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # Amadeus API
    AMADEUS_CLIENT_ID: str = ""
    AMADEUS_CLIENT_SECRET: str = ""
    AMADEUS_BASE_URL: str = "https://test.api.amadeus.com"

    # Collection settings
    COLLECTION_BATCH_SIZE: int = 10
    MAX_RETRIES: int = 3

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


pipeline_settings = PipelineSettings()
