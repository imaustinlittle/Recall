from functools import lru_cache
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
    minio_bucket: str = "meetscribe"

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

    # App
    environment: str = "development"
    log_level: str = "INFO"

    @property
    def is_dev(self) -> bool:
        return self.environment == "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
