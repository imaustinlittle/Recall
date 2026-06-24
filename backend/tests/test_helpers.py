"""
Unit tests for the pure helper logic added in the feature work
(folders/tags, retention, chat/RAG, voice profiles).

These cover functions that don't touch the database, so they run without a
live Postgres/Redis. Run with: pytest backend/tests
"""
import pytest


# ── embeddings.chunk_segments ────────────────────────────────────────────────

from app.services.embeddings import chunk_segments, CHUNK_TARGET_CHARS


def _seg(speaker, start, end, text):
    return {"speaker": speaker, "start": start, "end": end, "text": text}


def test_chunk_segments_basic_grouping():
    segs = [
        _seg("Alice", 0.0, 2.0, "hello there"),
        _seg("Bob", 2.0, 4.0, "general kenobi"),
    ]
    chunks = chunk_segments(segs)
    assert len(chunks) == 1
    c = chunks[0]
    assert c["start_time"] == 0.0
    assert c["end_time"] == 4.0
    assert "[Alice] hello there" in c["content"]
    assert "[Bob] general kenobi" in c["content"]


def test_chunk_segments_splits_on_target_size():
    # Each line is long; expect multiple chunks once we cross the target.
    long_text = "x" * (CHUNK_TARGET_CHARS // 2)
    segs = [_seg("S", i, i + 1, long_text) for i in range(6)]
    chunks = chunk_segments(segs)
    assert len(chunks) >= 2
    # Chunks are contiguous and ordered.
    assert chunks[0]["start_time"] <= chunks[-1]["start_time"]


def test_chunk_segments_skips_empty_text():
    segs = [_seg("S", 0.0, 1.0, "   "), _seg("S", 1.0, 2.0, "real content")]
    chunks = chunk_segments(segs)
    assert len(chunks) == 1
    assert "real content" in chunks[0]["content"]
    assert chunks[0]["start_time"] == 1.0


def test_chunk_segments_unknown_speaker_label():
    chunks = chunk_segments([_seg(None, 0.0, 1.0, "anon")])
    assert "[Unknown] anon" in chunks[0]["content"]


def test_chunk_segments_empty_input():
    assert chunk_segments([]) == []


# ── chat router helpers ──────────────────────────────────────────────────────

from app.routers.chat import _fmt_ts, _snippet, _build_prompt, SNIPPET_CHARS


def test_fmt_ts():
    assert _fmt_ts(0) == "00:00"
    assert _fmt_ts(65) == "01:05"
    assert _fmt_ts(3599) == "59:59"


def test_snippet_truncates_and_flattens():
    text = "word " * 100
    out = _snippet(text)
    assert len(out) <= SNIPPET_CHARS + 1  # +1 for the ellipsis
    assert out.endswith("…")


def test_snippet_short_text_unchanged():
    assert _snippet("short") == "short"


def test_build_prompt_structure():
    class FakeMsg:
        def __init__(self, role, content):
            self.role = type("R", (), {"value": role})()
            self.content = content

    history = [FakeMsg("user", "hi"), FakeMsg("assistant", "hello")]
    msgs = _build_prompt("CTX", history, "what now?")
    assert msgs[0]["role"] == "system"
    assert "CTX" in msgs[0]["content"]
    assert msgs[1] == {"role": "user", "content": "hi"}
    assert msgs[2] == {"role": "assistant", "content": "hello"}
    assert msgs[-1] == {"role": "user", "content": "what now?"}


# ── voice router helpers ─────────────────────────────────────────────────────

from app.routers.voice import _to_list, _running_average


def test_to_list_from_list():
    assert _to_list([1, 2, 3]) == [1.0, 2.0, 3.0]


def test_to_list_from_iterable():
    assert _to_list((0.5, 1.5)) == [0.5, 1.5]


def test_running_average_incremental_mean():
    # mean of [0,0] (n=1) with new [2,4] -> (0*1+2)/2, (0*1+4)/2 = [1,2]
    assert _running_average([0.0, 0.0], 1, [2.0, 4.0]) == [1.0, 2.0]


def test_running_average_weights_by_sample_count():
    # old=[3] averaged over n=3 with new=[7] -> (3*3+7)/4 = 4.0
    assert _running_average([3.0], 3, [7.0]) == [4.0]


def test_running_average_dimension_mismatch_returns_new():
    assert _running_average([1.0, 2.0], 1, [9.0]) == [9.0]


# ── admin float validator ────────────────────────────────────────────────────

from app.routers.admin import _is_unit_float


@pytest.mark.parametrize("val,expected", [
    ("0", True), ("1", True), ("0.75", True),
    ("-0.1", False), ("1.5", False), ("abc", False), ("", False),
])
def test_is_unit_float(val, expected):
    assert _is_unit_float(val) is expected
