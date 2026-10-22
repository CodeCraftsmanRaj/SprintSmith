from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "SprintSmith API"
    environment: str = "local"
    version: str = "0.1.0"
    database_url: str = "postgresql://sprintsmith:sprintsmith@db:5432/sprintsmith"
    log_level: str = "INFO"

    model_config = SettingsConfigDict(env_file=".env", env_prefix="SPRINTSMITH_", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()