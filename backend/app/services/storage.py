"""
Storage abstraction layer.
Currently supports local filesystem only.
MinIO (S3-compatible) support is stubbed for Phase 2.
"""
import shutil
import logging
from pathlib import Path
from app.config import settings

logger = logging.getLogger(__name__)


def get_media_url(relative_path: str) -> str:
    """Return a URL that the frontend can use to stream the file."""
    return f"/media/{relative_path}"


def delete_file(file_path: str) -> None:
    """Delete a file from whichever backend it was stored on."""
    if settings.storage_backend == "local":
        p = Path(file_path)
        p.unlink(missing_ok=True)
        logger.info(f"Deleted local file: {file_path}")
    else:
        # MinIO stub — implement in Phase 2
        raise NotImplementedError("MinIO delete not yet implemented")


def meeting_media_dir(meeting_id: str) -> Path:
    """Return (and create) the directory for a meeting's media files."""
    d = Path(settings.media_root) / meeting_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def cleanup_wav(wav_path: str, original_path: str) -> None:
    """Delete the intermediate WAV if it differs from the original upload."""
    if wav_path != original_path:
        Path(wav_path).unlink(missing_ok=True)
        logger.debug(f"Cleaned up intermediate WAV: {wav_path}")
