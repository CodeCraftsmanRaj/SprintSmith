from functools import lru_cache

from pydantic import AliasChoices, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "SprintSmith API"
    environment: str = "local"
    version: str = "0.1.0"
    database_url: str = Field(
        default="postgresql://sprintsmith:sprintsmith@db:5432/sprintsmith",
        validation_alias=AliasChoices("SPRINTSMITH_DATABASE_URL", "DATABASE_URL"),
    )
    upload_dir: str = Field(
        default="/data/uploads",
        validation_alias=AliasChoices("SPRINTSMITH_UPLOAD_DIR", "UPLOAD_DIR"),
    )
    log_level: str = Field(
        default="INFO",
        validation_alias=AliasChoices("SPRINTSMITH_LOG_LEVEL", "LOG_LEVEL"),
    )
    groq_api_key: SecretStr | None = Field(
        default=None,
        validation_alias=AliasChoices("SPRINTSMITH_GROQ_API_KEY", "GROQ_API_KEY"),
    )
    google_api_key: SecretStr | None = Field(
        default=None,
        validation_alias=AliasChoices("SPRINTSMITH_GOOGLE_API_KEY", "GOOGLE_API_KEY"),
    )
    default_llm: str = Field(
        default="local",
        validation_alias=AliasChoices("SPRINTSMITH_DEFAULT_LLM", "DEFAULT_LLM"),
    )
    fallback_llm: str = Field(
        default="local",
        validation_alias=AliasChoices("SPRINTSMITH_FALLBACK_LLM", "FALLBACK_LLM"),
    )

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()