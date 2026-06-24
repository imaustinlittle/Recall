from contextlib import contextmanager
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy import create_engine
from app.config import settings


# ── Async engine (used by FastAPI routes) ──────────────────────────────────
async_engine = create_async_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    echo=settings.is_dev,
)

AsyncSessionLocal = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ── Sync engine (used by Celery tasks) ─────────────────────────────────────
sync_engine = create_engine(
    settings.database_sync_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)

# Note on pgvector: the `pgvector.sqlalchemy.Vector` column type serializes
# values to/from text in its own bind/result processors, so it works across
# asyncpg and psycopg2 without registering a driver-level codec. (Registering
# the binary asyncpg codec would actually conflict with that text path.)

SyncSessionLocal = sessionmaker(bind=sync_engine, expire_on_commit=False)


# ── Declarative base ────────────────────────────────────────────────────────
class Base(DeclarativeBase):
    pass


# ── Session dependencies ────────────────────────────────────────────────────
async def get_async_db():
    """FastAPI dependency: yields an async SQLAlchemy session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@contextmanager
def get_sync_session():
    """Context manager for sync sessions (used in Celery tasks)."""
    session: Session = SyncSessionLocal()
    try:
        yield session
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
