from __future__ import annotations

import logging
import os
from typing import Any, Dict, List

from config import DEFAULT_WHISPER_MODEL, DEFAULT_TRANSCRIBE_TIMEOUT_MS, SUPPORTED_SOURCE_LANGUAGES, resolve_model_cache_dir

logger = logging.getLogger("subforge.worker")
logger.setLevel(logging.INFO)

try:
    from faster_whisper import WhisperModel
except Exception as exc:  # pragma: no cover - handled at runtime
    WhisperModel = None  # type: ignore[assignment]
    _IMPORT_ERROR = exc
else:
    _IMPORT_ERROR = None


def _select_device() -> str:
    if os.environ.get("CUDA_VISIBLE_DEVICES") == "":
        return "cpu"

    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
    except Exception:  # pragma: no cover - env-specific
        pass
    return "cpu"


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _normalize_segments(raw_segments: Any) -> List[Dict[str, Any]]:
    if not isinstance(raw_segments, (list, tuple)):
        raise RuntimeError("INVALID_TRANSCRIPTION_RESULT:segments payload is not a list")

    normalized: List[Dict[str, Any]] = []
    for index, segment in enumerate(raw_segments):
        payload: Dict[str, Any]

        if isinstance(segment, dict):
            payload = segment
        else:
            payload = {
                "text": getattr(segment, "text", None),
                "start": getattr(segment, "start", None),
                "end": getattr(segment, "end", None),
            }

        text = str(payload.get("text") or "").strip()
        if not text:
            continue

        start_ms = round(_safe_float(payload.get("start"), 0.0) * 1000.0)
        end_ms = round(_safe_float(payload.get("end"), 0.0) * 1000.0)
        if start_ms < 0 or end_ms <= start_ms:
            continue

        normalized.append(
            {
                "sequence": index,
                "startMs": start_ms,
                "endMs": end_ms,
                "text": text,
            }
        )

    if not normalized:
        raise RuntimeError("INVALID_TRANSCRIPTION_RESULT:No valid transcription segments were returned.")

    return normalized


def transcribe_media(source_path: str, source_language: str) -> Dict[str, Any]:
    if source_language not in SUPPORTED_SOURCE_LANGUAGES:
        raise RuntimeError(f"INVALID_SOURCE_LANGUAGE:{source_language}")

    if WhisperModel is None:
        raise RuntimeError(f"WHISPER_NOT_AVAILABLE:{_IMPORT_ERROR}")

    model_name = DEFAULT_WHISPER_MODEL
    device = _select_device()
    compute_type = "float16" if device == "cuda" else "int8"

    model = WhisperModel(
        model_name,
        device=device,
        compute_type=compute_type,
        download_root=resolve_model_cache_dir(),
    )

    segments, _info = model.transcribe(
        source_path,
        language=source_language,
        vad_filter=True,
        word_timestamps=False,
    )

    normalized_segments = _normalize_segments(list(segments))
    return {"segments": normalized_segments}


def transcribe_timeout_ms() -> int:
    return DEFAULT_TRANSCRIBE_TIMEOUT_MS
