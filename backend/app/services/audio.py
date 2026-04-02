import subprocess
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def extract_wav(input_path: str) -> str:
    """
    Convert any audio/video file to a 16 kHz mono WAV suitable for Whisper.
    If the input is already a WAV, returns the input path unchanged.
    Output is written alongside the input file.
    """
    src = Path(input_path)

    if src.suffix.lower() == ".wav":
        return str(src)

    dst = src.with_suffix(".wav")

    cmd = [
        "ffmpeg", "-y",
        "-i", str(src),
        "-vn",               # drop video stream
        "-acodec", "pcm_s16le",
        "-ar", "16000",      # 16 kHz — Whisper's native rate
        "-ac", "1",          # mono
        "-loglevel", "error",
        str(dst),
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg conversion failed:\n{result.stderr}")

    logger.info(f"Converted audio: {src.name} → {dst.name}")
    return str(dst)


def get_duration(path: str) -> float:
    """Return duration of an audio/video file in seconds using ffprobe."""
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return float(result.stdout.strip())
    except (ValueError, TypeError):
        return 0.0
