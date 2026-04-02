# ── GPU-capable backend image ──────────────────────────────────────────────
# Works on CPU too — just larger than a plain Python image.
# For CPU-only deployments you can swap the base to python:3.11-slim and
# remove the CUDA-specific layer, then set WHISPER_DEVICE=cpu in your .env.
FROM nvidia/cuda:12.3.2-cudnn9-runtime-ubuntu22.04

# System dependencies — single RUN to minimise layers
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 python3-pip python3.11-dev \
    ffmpeg libmagic1 gcc \
    && ln -sf /usr/bin/python3.11 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps before copying source so this layer is cached
COPY requirements.txt .
RUN pip install --upgrade pip && pip install --no-cache-dir -r requirements.txt

# Pre-download the Whisper model at build time so the first transcription
# starts immediately. Override via: docker build --build-arg WHISPER_MODEL=small
ARG WHISPER_MODEL=base
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('${WHISPER_MODEL}', device='cpu', compute_type='int8')"

COPY . .

ENV PYTHONPATH=/app \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
