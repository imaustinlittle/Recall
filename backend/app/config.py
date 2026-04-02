from functools import lru_cache
from typing import ClassVar
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

    # Database
    database_url: str
    database_sync_url: str

    # Redis
    redis_url: str = "redis://redis:6379/0"

    # Storage
    media_root: str = "/data/media"
    storage_backend: str = "local"

    # MinIO
    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "recall"

    # Whisper
    whisper_model: str = "base"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"

    # Diarization
    use_diarization: bool = False
    huggingface_token: str = ""

    # Auth
    secret_key: str
    access_token_expire_minutes: int = 10080  # 7 days
    _default_secret: ClassVar[str] = "change_me_to_a_long_random_string_in_production"

    @property
    def secret_key_is_default(self) -> bool:
        return self.secret_key == self._default_secret

    # CORS — comma-separated list of allowed origins
    cors_origins: str = "http://localhost:3000"

    # Upload
    max_upload_bytes: int = 2 * 1024 ** 3  # 2 GB

    # App
    environment: str = "development"
    log_level: str = "INFO"

    @property
    def is_dev(self) -> bool:
        return self.environment == "development"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
