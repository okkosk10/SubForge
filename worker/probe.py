from __future__ import annotations

import json
import shutil
import subprocess
from typing import Any, Dict, List, Optional


def resolve_ffprobe_path() -> str:
    return "ffprobe"


def _parse_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _parse_fps(value: Any) -> Optional[float]:
    if not isinstance(value, str) or not value:
        return None

    if "/" in value:
        left, right = value.split("/", 1)
        try:
            numerator = float(left)
            denominator = float(right)
            if denominator == 0:
                return None
            return numerator / denominator
        except (TypeError, ValueError):
            return None

    return _parse_float(value)


def parse_probe_metadata(raw: Dict[str, Any]) -> Dict[str, Any]:
    format_data = raw.get("format") if isinstance(raw.get("format"), dict) else {}
    streams = raw.get("streams") if isinstance(raw.get("streams"), list) else []

    video_stream = next((s for s in streams if isinstance(s, dict) and s.get("codec_type") == "video"), None)
    audio_stream = next((s for s in streams if isinstance(s, dict) and s.get("codec_type") == "audio"), None)

    duration_sec = _parse_float(format_data.get("duration"))
    duration_ms = int(duration_sec * 1000) if duration_sec is not None else None

    bit_rate = _parse_int(format_data.get("bit_rate"))
    size_bytes = _parse_int(format_data.get("size"))
    format_name = format_data.get("format_name") if isinstance(format_data.get("format_name"), str) else None

    video = None
    if isinstance(video_stream, dict):
        video = {
            "codec": video_stream.get("codec_name") if isinstance(video_stream.get("codec_name"), str) else None,
            "width": _parse_int(video_stream.get("width")),
            "height": _parse_int(video_stream.get("height")),
            "fps": _parse_fps(video_stream.get("avg_frame_rate")),
        }

    audio = None
    if isinstance(audio_stream, dict):
        audio = {
            "codec": audio_stream.get("codec_name") if isinstance(audio_stream.get("codec_name"), str) else None,
            "sampleRate": _parse_int(audio_stream.get("sample_rate")),
            "channels": _parse_int(audio_stream.get("channels")),
        }

    return {
        "durationMs": duration_ms,
        "formatName": format_name,
        "sizeBytes": size_bytes,
        "bitRate": bit_rate,
        "video": video,
        "audio": audio,
    }


def probe_media(source_path: str) -> Dict[str, Any]:
    ffprobe_path = resolve_ffprobe_path()
    if not shutil.which(ffprobe_path):
        raise FileNotFoundError("FFPROBE_NOT_FOUND")

    command: List[str] = [
        ffprobe_path,
        "-v",
        "error",
        "-show_format",
        "-show_streams",
        "-of",
        "json",
        source_path,
    ]

    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )

    if result.returncode != 0:
        details = result.stderr.strip() or "ffprobe returned non-zero exit code"
        raise RuntimeError(f"FFPROBE_FAILED:{details}")

    try:
        raw = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"INVALID_PROBE_RESULT:{error.msg}") from error

    if not isinstance(raw, dict):
        raise RuntimeError("INVALID_PROBE_RESULT:ffprobe output root is not an object")

    return parse_probe_metadata(raw)
