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

    # Voice profiles — recognize speakers across meetings (requires diarization).
    # voice_match_threshold is a cosine SIMILARITY in [0, 1]; a diarized speaker
    # is auto-labeled with a saved profile only when similarity >= threshold.
    # Conservative by default so it never confidently mislabels.
    voice_embed_model: str = "pyannote/embedding"
    voice_match_threshold: float = 0.75

    # Auth
    secret_key: str
    access_token_expire_minutes: int = 10080  # 7 days
    _default_secret: ClassVar[str] = "change_me_to_a_long_random_string_in_production"

    @property
    def secret_key_is_default(self) -> bool:
        return self.secret_key == self._default_secret

    # ── Authentication mode ──────────────────────────────────────────────────
    # "local" → built-in email/password login (default).
    # "proxy" → trust forward-auth identity headers injected by an upstream
    #           proxy (e.g. Authentik / Traefik forwardAuth). The app does no
    #           login of its own; users are provisioned just-in-time from the
    #           headers below. ONLY safe when the app is exclusively reachable
    #           through the authenticating proxy (the API must never be exposed
    #           directly, or clients could spoof these headers).
    auth_mode: str = "local"

    # Header names the proxy sets (Authentik proxy-provider defaults). Header
    # lookups are case-insensitive.
    proxy_auth_email_header: str = "X-Authentik-Email"
    proxy_auth_username_header: str = "X-Authentik-Username"
    proxy_auth_name_header: str = "X-Authentik-Name"
    proxy_auth_groups_header: str = "X-Authentik-Groups"
    # Authentik joins group names with "|" in the groups header.
    proxy_auth_groups_separator: str = "|"
    # If set, only users in this group get is_admin. If blank, every
    # proxy-authenticated user is treated as an admin.
    proxy_auth_admin_group: str = ""
    # Where the UI "Sign out" link sends the user in proxy mode (the proxy's
    # own logout endpoint). Authentik's default outpost sign-out path.
    proxy_auth_logout_url: str = "/outpost.goauthentik.io/sign_out"

    @property
    def is_proxy_auth(self) -> bool:
        return self.auth_mode.strip().lower() == "proxy"

    # CORS — comma-separated list of allowed origins
    cors_origins: str = "http://localhost:3000"

    # Upload
    max_upload_bytes: int = 2 * 1024 ** 3  # 2 GB

    # Summarization (Ollama)
    ollama_base_url: str = "http://ollama:11434"
    ollama_model: str = "llama3.1:8b"

    # Embeddings (Ollama) — used for transcript chat / RAG retrieval.
    # The embedding dimension must match the model; nomic-embed-text → 768.
    # Changing the model requires re-indexing existing meetings.
    ollama_embed_model: str = "nomic-embed-text"

    # Retention — automatic cleanup of old recordings.
    #   retention_mode: "off"        → never auto-delete (default)
    #                   "audio_only" → delete the media file, keep transcript/notes/summary
    #                   "all"        → delete the entire meeting and its data
    # retention_days: age threshold; 0 disables regardless of mode.
    retention_mode: str = "off"
    retention_days: int = 0

    # App
    environment: str = "development"
    log_level: str = "INFO"

    @property
    def is_dev(self) -> bool:
        return self.environment.lower() == "development"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
