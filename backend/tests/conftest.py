"""
Test config. Sets the env vars that app.config.Settings requires so the app
modules import without a real .env or database connection (engines are created
lazily and never connected in these unit tests).
"""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://u:p@localhost/test")
os.environ.setdefault("DATABASE_SYNC_URL", "postgresql://u:p@localhost/test")
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-used-for-anything-real")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
