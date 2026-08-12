from __future__ import annotations

import sys
import time
from typing import Any, Dict, List

from config import SUPPORTED_SOURCE_LANGUAGES
from translators import AihubJapaneseKoreanTranslator, ArgosTranslator

_aihub_translator = AihubJapaneseKoreanTranslator()
_argos_translator = ArgosTranslator()


def _validate_segments(raw_segments: Any) -> List[Dict[str, Any]]:
    if not isinstance(raw_segments, list):
        raise RuntimeError("INVALID_TRANSLATION_RESULT:payload.segments must be a list")

    normalized: List[Dict[str, Any]] = []
    for item in raw_segments:
        if not isinstance(item, dict):
            raise RuntimeError("INVALID_TRANSLATION_RESULT:segment payload must be an object")

        sequence = item.get("sequence")
        text = item.get("text")

        if not isinstance(sequence, int):
            raise RuntimeError("INVALID_TRANSLATION_RESULT:segment.sequence must be an integer")
        if not isinstance(text, str):
            raise RuntimeError("INVALID_TRANSLATION_RESULT:segment.text must be a string")

        source_text = text.strip()
        if not source_text:
            continue

        normalized.append({"sequence": sequence, "text": source_text})

    return normalized


def _emit_timing(provider: str, timing: Dict[str, int], segment_count: int) -> None:
    parts = [f"provider={provider}", f"segments={segment_count}", f"totalMs={timing.get('totalMs', 0)}"]
    if "modelLoadMs" in timing:
        parts.append(f"modelLoadMs={timing['modelLoadMs']}")
    if "inferenceMs" in timing:
        parts.append(f"inferenceMs={timing['inferenceMs']}")
    print(f"[translation] {' '.join(parts)}", file=sys.stderr, flush=True)


def translate_segments(source_language: str, target_language: str, raw_segments: Any) -> Dict[str, Any]:
    if source_language not in SUPPORTED_SOURCE_LANGUAGES:
        raise RuntimeError(f"INVALID_SOURCE_LANGUAGE:{source_language}")
    if target_language != "ko":
        raise RuntimeError(f"INVALID_TARGET_LANGUAGE:{target_language}")

    segments = _validate_segments(raw_segments)
    if not segments:
        return {"segments": []}

    if source_language == "ja":
        aihub_started = time.perf_counter()
        try:
            translated_segments, timing = _aihub_translator.translate_segments(segments)
            _emit_timing("aihub-ja-ko", timing, len(translated_segments))
            return {
                "segments": translated_segments,
                "provider": "aihub-ja-ko",
                "fallbackUsed": False,
                "timing": timing,
            }
        except Exception as aihub_error:
            fallback_reason = str(aihub_error).strip()
            print(
                "[translation] provider=aihub-ja-ko failed; falling back to argos. "
                f"reason={fallback_reason} elapsedMs={int((time.perf_counter() - aihub_started) * 1000)}",
                file=sys.stderr,
                flush=True,
            )

            try:
                fallback_result = _argos_translator.translate_segments(source_language, target_language, segments)
                fallback_timing = fallback_result.get("timing") if isinstance(fallback_result.get("timing"), dict) else {}
                _emit_timing("argos", fallback_timing, len(fallback_result.get("segments", [])))
                return {
                    "segments": fallback_result["segments"],
                    "provider": "argos",
                    "fallbackUsed": True,
                    "fallbackReason": fallback_reason,
                    "timing": fallback_timing,
                }
            except Exception as argos_error:
                raise RuntimeError(
                    "TRANSLATION_FAILED:Local translation failed after Japanese direct and Argos fallback attempts "
                    f"({argos_error})."
                )

    result = _argos_translator.translate_segments(source_language, target_language, segments)
    timing = result.get("timing") if isinstance(result.get("timing"), dict) else {}
    _emit_timing("argos", timing, len(result.get("segments", [])))
    return result
