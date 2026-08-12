from __future__ import annotations

import logging
from typing import Any, Dict, List

from config import SUPPORTED_SOURCE_LANGUAGES

logger = logging.getLogger("subforge.worker.translate")
PIVOT_LANGUAGE = "en"

try:
    import argostranslate.package
    import argostranslate.translate
except Exception as exc:  # pragma: no cover - handled at runtime
    argostranslate = None  # type: ignore[assignment]
    _IMPORT_ERROR = exc
else:
    _IMPORT_ERROR = None


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


def _find_installed_language(language_code: str):
    installed_languages = argostranslate.translate.get_installed_languages()
    return next((language for language in installed_languages if language.code == language_code), None)


def _has_installed_translation(source_language: str, target_language: str) -> bool:
    source = _find_installed_language(source_language)
    target = _find_installed_language(target_language)
    if source and target:
        try:
            translation = source.get_translation(target)
            return translation is not None
        except Exception:
            return False
    return False


def _install_language_pair(source_language: str, target_language: str) -> bool:
    available_packages = argostranslate.package.get_available_packages()
    package = next(
        (
            candidate
            for candidate in available_packages
            if candidate.from_code == source_language and candidate.to_code == target_language
        ),
        None,
    )

    if package is None:
        return False

    try:
        logger.info("Installing Argos package %s->%s", source_language, target_language)
        package_path = package.download()
        argostranslate.package.install_from_path(package_path)
        return True
    except Exception as exc:
        raise RuntimeError(f"TRANSLATION_MODEL_LOAD_FAILED:Failed to install translation package ({exc}).")


def _ensure_language_pair(source_language: str, target_language: str) -> None:
    if _has_installed_translation(source_language, target_language):
        return

    try:
        argostranslate.package.update_package_index()
    except Exception as exc:
        raise RuntimeError(f"TRANSLATION_MODEL_LOAD_FAILED:Failed to refresh translation package index ({exc}).")

    if _install_language_pair(source_language, target_language) and _has_installed_translation(
        source_language, target_language
    ):
        return

    if source_language != PIVOT_LANGUAGE:
        first_hop_ok = _has_installed_translation(source_language, PIVOT_LANGUAGE) or _install_language_pair(
            source_language, PIVOT_LANGUAGE
        )
        second_hop_ok = _has_installed_translation(PIVOT_LANGUAGE, target_language) or _install_language_pair(
            PIVOT_LANGUAGE, target_language
        )
        if first_hop_ok and second_hop_ok:
            return

    raise RuntimeError(
        f"TRANSLATOR_NOT_AVAILABLE:No local translation route for {source_language}->{target_language}."
    )


def _translate_text(source_language: str, target_language: str, text: str) -> str:
    if _has_installed_translation(source_language, target_language):
        source = _find_installed_language(source_language)
        target = _find_installed_language(target_language)
        if source is None or target is None:
            raise RuntimeError("TRANSLATOR_NOT_AVAILABLE:Installed translation language metadata is incomplete.")
        try:
            translator = source.get_translation(target)
            if translator is None:
                raise RuntimeError("TRANSLATOR_NOT_AVAILABLE:Direct translation route is unavailable.")
            return translator.translate(text).strip()
        except Exception as exc:
            raise RuntimeError(f"TRANSLATION_FAILED:Failed to translate text ({exc}).")

    if source_language != PIVOT_LANGUAGE and _has_installed_translation(source_language, PIVOT_LANGUAGE):
        source = _find_installed_language(source_language)
        pivot = _find_installed_language(PIVOT_LANGUAGE)
        target = _find_installed_language(target_language)
        if source and pivot and target and _has_installed_translation(PIVOT_LANGUAGE, target_language):
            try:
                first_hop_translator = source.get_translation(pivot)
                second_hop_translator = pivot.get_translation(target)
                if first_hop_translator is None or second_hop_translator is None:
                    raise RuntimeError("Pivot translation route is unavailable.")
                first_hop = first_hop_translator.translate(text).strip()
                return second_hop_translator.translate(first_hop).strip()
            except Exception as exc:
                raise RuntimeError(f"TRANSLATION_FAILED:Failed to translate text ({exc}).")

    raise RuntimeError(f"TRANSLATOR_NOT_AVAILABLE:No installed translation route for {source_language}->{target_language}.")


def translate_segments(source_language: str, target_language: str, raw_segments: Any) -> Dict[str, Any]:
    if source_language not in SUPPORTED_SOURCE_LANGUAGES:
        raise RuntimeError(f"INVALID_SOURCE_LANGUAGE:{source_language}")
    if target_language != "ko":
        raise RuntimeError(f"INVALID_TARGET_LANGUAGE:{target_language}")

    if argostranslate is None:
        raise RuntimeError(f"TRANSLATOR_NOT_AVAILABLE:{_IMPORT_ERROR}")

    segments = _validate_segments(raw_segments)
    if not segments:
        return {"segments": []}

    _ensure_language_pair(source_language, target_language)

    translated_segments: List[Dict[str, Any]] = []
    for segment in segments:
        translated_text = _translate_text(source_language, target_language, segment["text"])
        translated_segments.append(
            {
                "sequence": segment["sequence"],
                "translatedText": translated_text,
            }
        )

    return {"segments": translated_segments}
