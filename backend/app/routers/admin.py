"""
Admin settings router.
GET  /api/admin/settings  — returns the full settings schema + current effective values
PATCH /api/admin/settings — saves overrides to the app_settings table

Changes to most settings require a container restart to take effect.
LOG_LEVEL is applied immediately without a restart.
"""
import logging
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_async_db
from app.deps import get_current_user
from app.config import settings
from app import models

router = APIRouter()
logger = logging.getLogger(__name__)

# ── Settings schema ────────────────────────────────────────────────────────────
# Each entry describes one configurable setting shown in the admin GUI.
SETTINGS_SCHEMA: list[dict] = [
    {
        "key": "whisper_model",
        "label": "Whisper Model",
        "section": "Transcription",
        "description": "Accuracy vs. speed. Large models need more RAM/VRAM.",
        "type": "select",
        "options": ["tiny", "base", "small", "medium", "large-v3"],
        "restart_required": True,
    },
    {
        "key": "whisper_device",
        "label": "Compute Device",
        "section": "Transcription",
        "description": "Use 'cuda' if you have an NVIDIA GPU available.",
        "type": "select",
        "options": ["cpu", "cuda"],
        "restart_required": True,
    },
    {
        "key": "whisper_compute_type",
        "label": "Compute Type",
        "section": "Transcription",
        "description": "'int8' is fastest on CPU; 'float16' is best on GPU.",
        "type": "select",
        "options": ["int8", "float16", "float32"],
        "restart_required": True,
    },
    {
        "key": "use_diarization",
        "label": "Speaker Diarization",
        "section": "Transcription",
        "description": "Identify and label individual speakers. Requires a HuggingFace token.",
        "type": "bool",
        "restart_required": True,
    },
    {
        "key": "huggingface_token",
        "label": "HuggingFace Token",
        "section": "Transcription",
        "description": "Required for diarization. Create one at huggingface.co/settings/tokens.",
        "type": "password",
        "restart_required": True,
    },
    {
        "key": "max_upload_bytes",
        "label": "Max Upload Size (bytes)",
        "section": "Storage",
        "description": "Maximum file size per upload. Default: 2147483648 (2 GB).",
        "type": "number",
        "restart_required": False,
    },
    {
        "key": "cors_origins",
        "label": "Allowed Origins",
        "section": "Network",
        "description": (
            "Comma-separated list of origins allowed to call the API. "
            "E.g. https://myserver.com,https://other.com"
        ),
        "type": "text",
        "restart_required": True,
    },
    {
        "key": "access_token_expire_minutes",
        "label": "Session Duration (minutes)",
        "section": "Auth",
        "description": "How long login sessions stay valid. Default: 10080 (7 days).",
        "type": "number",
        "restart_required": False,
    },
    {
        "key": "log_level",
        "label": "Log Level",
        "section": "App",
        "description": "Verbosity of application logs. Applied immediately.",
        "type": "select",
        "options": ["DEBUG", "INFO", "WARNING", "ERROR"],
        "restart_required": False,
    },
]

# Keys that are sensitive — value is masked on read
_SENSITIVE_KEYS = {"huggingface_token"}

# Keys whose current value lives on the settings object
_SETTINGS_ATTR: dict[str, str] = {s["key"]: s["key"] for s in SETTINGS_SCHEMA}


def _current_value(key: str) -> Any:
    """Return the current effective value from the (possibly patched) settings object."""
    return getattr(settings, key, None)


def _coerce(key: str, raw: str) -> Any:
    """Coerce a string value from the DB into the correct Python type."""
    entry = next((s for s in SETTINGS_SCHEMA if s["key"] == key), None)
    if entry is None:
        return raw
    if entry["type"] == "bool":
        return raw.lower() in ("true", "1", "yes")
    if entry["type"] == "number":
        return int(raw)
    return raw


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/settings")
async def get_settings(
    db: AsyncSession = Depends(get_async_db),
    _: models.User = Depends(get_current_user),
):
    """
    Returns the settings schema enriched with current effective values.
    Sensitive fields are masked.
    """
    # Load any DB overrides so we can flag which ones are pending
    db_rows = (await db.execute(select(models.AppSetting))).scalars().all()
    db_overrides = {row.key: row.value for row in db_rows}

    result = []
    for entry in SETTINGS_SCHEMA:
        key = entry["key"]
        current = _current_value(key)

        # Mask sensitive values
        display_value = current
        if key in _SENSITIVE_KEYS and current:
            display_value = "••••••••"

        result.append({
            **entry,
            "current_value": str(display_value) if display_value is not None else "",
            "has_db_override": key in db_overrides,
            "db_value": (
                "••••••••"
                if key in _SENSITIVE_KEYS and key in db_overrides
                else db_overrides.get(key)
            ),
        })

    return {
        "settings": result,
        "warnings": {
            "default_secret_key": settings.secret_key_is_default,
        },
    }


@router.patch("/settings")
async def patch_settings(
    body: dict[str, str],
    db: AsyncSession = Depends(get_async_db),
    _: models.User = Depends(get_current_user),
):
    """
    Upsert one or more settings overrides into the app_settings table.
    Also applies non-restart-required changes immediately (log level).
    Returns which saved settings require a restart.
    """
    valid_keys = {s["key"] for s in SETTINGS_SCHEMA}
    unknown = set(body.keys()) - valid_keys
    if unknown:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail=f"Unknown setting keys: {unknown}")

    needs_restart: list[str] = []

    for key, raw_value in body.items():
        # Upsert into DB
        existing = await db.get(models.AppSetting, key)
        if existing:
            existing.value = raw_value
        else:
            db.add(models.AppSetting(key=key, value=raw_value))

        # Patch the live settings object so subsequent requests see the new value
        coerced = _coerce(key, raw_value)
        setattr(settings, key, coerced)

        entry = next(s for s in SETTINGS_SCHEMA if s["key"] == key)
        if entry["restart_required"]:
            needs_restart.append(key)
        elif key == "log_level":
            # Apply log level immediately without restart
            logging.getLogger().setLevel(raw_value.upper())
            logger.info(f"Log level changed to {raw_value.upper()}")

    await db.commit()
    logger.info(f"[admin] Settings updated: {list(body.keys())}")

    return {
        "saved": list(body.keys()),
        "restart_required": needs_restart,
    }
