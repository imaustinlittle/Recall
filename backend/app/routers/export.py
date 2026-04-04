"""
Export router — download meeting transcripts in multiple formats.

GET /api/meetings/{meeting_id}/export?format=txt
GET /api/meetings/{meeting_id}/export?format=md
GET /api/meetings/{meeting_id}/export?format=srt
GET /api/meetings/{meeting_id}/export?format=vtt
GET /api/meetings/{meeting_id}/export?format=pdf
"""
import io
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_async_db
from app.deps import get_current_user
from app import models

router = APIRouter()

ExportFormat = Literal["txt", "md", "srt", "vtt", "pdf"]


# ── Helpers ────────────────────────────────────────────────────────────────────

def _fmt_time_srt(seconds: float) -> str:
    """Format seconds → HH:MM:SS,mmm (SRT style)."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int(round((seconds % 1) * 1000))
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _fmt_time_vtt(seconds: float) -> str:
    """Format seconds → HH:MM:SS.mmm (WebVTT style)."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int(round((seconds % 1) * 1000))
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def _fmt_time_human(seconds: float) -> str:
    """Format seconds → [HH:]MM:SS for display in TXT/MD."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def _speaker_name(seg: models.TranscriptSegment) -> str:
    if seg.speaker and seg.speaker.display_name:
        return seg.speaker.display_name
    if seg.speaker:
        return seg.speaker.label
    return "Unknown"


def _safe_filename(title: str) -> str:
    """Strip characters that are unsafe in filenames."""
    safe = "".join(c if c.isalnum() or c in " -_" else "_" for c in title)
    return safe.strip()[:80] or "transcript"


# ── Format builders ────────────────────────────────────────────────────────────

def _build_txt(meeting: models.Meeting, segments: list[models.TranscriptSegment]) -> str:
    lines = [
        f"Title: {meeting.title}",
        f"Date: {meeting.created_at.strftime('%B %d, %Y')}",
        "",
        "─" * 60,
        "",
    ]
    for seg in segments:
        speaker = _speaker_name(seg)
        ts = _fmt_time_human(seg.start_time)
        lines.append(f"[{ts}] {speaker}")
        lines.append(seg.content)
        lines.append("")
    return "\n".join(lines)


def _build_md(meeting: models.Meeting, segments: list[models.TranscriptSegment]) -> str:
    date_str = meeting.created_at.strftime("%B %d, %Y")
    lines = [
        f"# {meeting.title}",
        "",
        f"**Date:** {date_str}",
        "",
        "## Transcript",
        "",
    ]
    prev_speaker = None
    for seg in segments:
        speaker = _speaker_name(seg)
        ts = _fmt_time_human(seg.start_time)
        if speaker != prev_speaker:
            lines.append(f"**{speaker}**")
            prev_speaker = speaker
        lines.append(f"*[{ts}]* {seg.content}")
        lines.append("")
    return "\n".join(lines)


def _build_srt(segments: list[models.TranscriptSegment]) -> str:
    lines = []
    for i, seg in enumerate(segments, start=1):
        speaker = _speaker_name(seg)
        lines.append(str(i))
        lines.append(f"{_fmt_time_srt(seg.start_time)} --> {_fmt_time_srt(seg.end_time)}")
        lines.append(f"{speaker}: {seg.content}")
        lines.append("")
    return "\n".join(lines)


def _build_vtt(segments: list[models.TranscriptSegment]) -> str:
    lines = ["WEBVTT", ""]
    for seg in segments:
        speaker = _speaker_name(seg)
        lines.append(f"{_fmt_time_vtt(seg.start_time)} --> {_fmt_time_vtt(seg.end_time)}")
        lines.append(f"{speaker}: {seg.content}")
        lines.append("")
    return "\n".join(lines)


def _build_pdf(meeting: models.Meeting, segments: list[models.TranscriptSegment]) -> bytes:
    try:
        from fpdf import FPDF
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="PDF export requires the fpdf2 package. Contact your administrator."
        )

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    # Title
    pdf.set_font("Helvetica", "B", 18)
    pdf.multi_cell(0, 10, meeting.title, align="L")

    # Date
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(120, 120, 120)
    pdf.cell(0, 6, meeting.created_at.strftime("%B %d, %Y"), ln=True)
    pdf.set_text_color(0, 0, 0)
    pdf.ln(4)

    # Divider
    pdf.set_draw_color(200, 200, 200)
    pdf.line(pdf.get_x(), pdf.get_y(), pdf.get_x() + 190, pdf.get_y())
    pdf.ln(6)

    # Transcript
    prev_speaker = None
    for seg in segments:
        speaker = _speaker_name(seg)
        ts = _fmt_time_human(seg.start_time)

        if speaker != prev_speaker:
            pdf.ln(2)
            pdf.set_font("Helvetica", "B", 9)
            pdf.set_text_color(80, 80, 200)
            pdf.cell(0, 5, f"{speaker}  [{ts}]", ln=True)
            pdf.set_text_color(0, 0, 0)
            prev_speaker = speaker

        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(0, 5, seg.content)

    return pdf.output()


# ── MIME / extension maps ──────────────────────────────────────────────────────

_MIME: dict[str, str] = {
    "txt": "text/plain; charset=utf-8",
    "md":  "text/markdown; charset=utf-8",
    "srt": "text/plain; charset=utf-8",
    "vtt": "text/vtt; charset=utf-8",
    "pdf": "application/pdf",
}

_EXT: dict[str, str] = {
    "txt": "txt",
    "md":  "md",
    "srt": "srt",
    "vtt": "vtt",
    "pdf": "pdf",
}


# ── Endpoint ───────────────────────────────────────────────────────────────────

@router.get("/meetings/{meeting_id}/export")
async def export_transcript(
    meeting_id: uuid.UUID,
    format: ExportFormat = Query(..., description="Export format: txt | md | srt | vtt | pdf"),
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    # Verify ownership
    result = await db.execute(
        select(models.Meeting).where(
            models.Meeting.id == meeting_id,
            models.Meeting.user_id == current_user.id,
        )
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    # Load segments with speakers
    seg_result = await db.execute(
        select(models.TranscriptSegment)
        .where(models.TranscriptSegment.meeting_id == meeting_id)
        .options(selectinload(models.TranscriptSegment.speaker))
        .order_by(models.TranscriptSegment.segment_index)
    )
    segments = seg_result.scalars().all()

    if not segments:
        raise HTTPException(status_code=404, detail="No transcript found for this meeting")

    # Build content
    if format == "txt":
        content: str | bytes = _build_txt(meeting, segments)
    elif format == "md":
        content = _build_md(meeting, segments)
    elif format == "srt":
        content = _build_srt(segments)
    elif format == "vtt":
        content = _build_vtt(segments)
    else:  # pdf
        content = _build_pdf(meeting, segments)

    filename = f"{_safe_filename(meeting.title)}.{_EXT[format]}"
    mime = _MIME[format]

    if isinstance(content, str):
        body = content.encode("utf-8")
    else:
        body = content

    return Response(
        content=body,
        media_type=mime,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(body)),
        },
    )
