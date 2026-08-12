from __future__ import annotations

import logging
import time
from typing import Dict, List


logger = logging.getLogger("subforge.worker.argos")
PIVOT_LANGUAGE = "en"


class ArgosTranslator:
    def __init__(self) -> None:
        try:
            import argostranslate.package
            import argostranslate.translate
        except Exception as exc:  # pragma: no cover - handled at runtime
            self._argostranslate = None
            self._import_error = exc
        else:
            self._argostranslate = {
                "package": argostranslate.package,
                "translate": argostranslate.translate,
            }
            self._import_error = None

    def ensure_available(self) -> None:
        if self._argostranslate is None:
            raise RuntimeError(f"TRANSLATOR_NOT_AVAILABLE:{self._import_error}")

    def _find_installed_language(self, language_code: str):
        self.ensure_available()
        translate = self._argostranslate["translate"]
        installed_languages = translate.get_installed_languages()
        return next((language for language in installed_languages if language.code == language_code), None)

    def _has_installed_translation(self, source_language: str, target_language: str) -> bool:
        source = self._find_installed_language(source_language)
        target = self._find_installed_language(target_language)
        if source and target:
            try:
                translation = source.get_translation(target)
                return translation is not None
            except Exception:
                return False
        return False

    def _install_language_pair(self, source_language: str, target_language: str) -> bool:
        self.ensure_available()
        package_api = self._argostranslate["package"]
        available_packages = package_api.get_available_packages()
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
            package_api.install_from_path(package_path)
            return True
        except Exception as exc:
            raise RuntimeError(f"TRANSLATION_MODEL_LOAD_FAILED:Failed to install translation package ({exc}).")

    def _ensure_language_pair(self, source_language: str, target_language: str) -> None:
        self.ensure_available()
        package_api = self._argostranslate["package"]

        if self._has_installed_translation(source_language, target_language):
            return

        try:
            package_api.update_package_index()
        except Exception as exc:
            raise RuntimeError(f"TRANSLATION_MODEL_LOAD_FAILED:Failed to refresh translation package index ({exc}).")

        if self._install_language_pair(source_language, target_language) and self._has_installed_translation(
            source_language, target_language
        ):
            return

        if source_language != PIVOT_LANGUAGE:
            first_hop_ok = self._has_installed_translation(source_language, PIVOT_LANGUAGE) or self._install_language_pair(
                source_language, PIVOT_LANGUAGE
            )
            second_hop_ok = self._has_installed_translation(PIVOT_LANGUAGE, target_language) or self._install_language_pair(
                PIVOT_LANGUAGE, target_language
            )
            if first_hop_ok and second_hop_ok:
                return

        raise RuntimeError(
            f"TRANSLATOR_NOT_AVAILABLE:No local translation route for {source_language}->{target_language}."
        )

    def _translate_text(self, source_language: str, target_language: str, text: str) -> str:
        if self._has_installed_translation(source_language, target_language):
            source = self._find_installed_language(source_language)
            target = self._find_installed_language(target_language)
            if source is None or target is None:
                raise RuntimeError("TRANSLATOR_NOT_AVAILABLE:Installed translation language metadata is incomplete.")
            try:
                translator = source.get_translation(target)
                if translator is None:
                    raise RuntimeError("TRANSLATOR_NOT_AVAILABLE:Direct translation route is unavailable.")
                return translator.translate(text).strip()
            except Exception as exc:
                raise RuntimeError(f"TRANSLATION_FAILED:Failed to translate text ({exc}).")

        if source_language != PIVOT_LANGUAGE and self._has_installed_translation(source_language, PIVOT_LANGUAGE):
            source = self._find_installed_language(source_language)
            pivot = self._find_installed_language(PIVOT_LANGUAGE)
            target = self._find_installed_language(target_language)
            if source and pivot and target and self._has_installed_translation(PIVOT_LANGUAGE, target_language):
                try:
                    first_hop_translator = source.get_translation(pivot)
                    second_hop_translator = pivot.get_translation(target)
                    if first_hop_translator is None or second_hop_translator is None:
                        raise RuntimeError("Pivot translation route is unavailable.")
                    first_hop = first_hop_translator.translate(text).strip()
                    return second_hop_translator.translate(first_hop).strip()
                except Exception as exc:
                    raise RuntimeError(f"TRANSLATION_FAILED:Failed to translate text ({exc}).")

        raise RuntimeError(
            f"TRANSLATOR_NOT_AVAILABLE:No installed translation route for {source_language}->{target_language}."
        )

    def translate_segments(self, source_language: str, target_language: str, segments: List[Dict[str, object]]) -> Dict[str, object]:
        started = time.perf_counter()
        self._ensure_language_pair(source_language, target_language)

        translated: List[Dict[str, object]] = []
        for segment in segments:
            translated_text = self._translate_text(source_language, target_language, str(segment["text"]))
            translated.append(
                {
                    "sequence": int(segment["sequence"]),
                    "translatedText": translated_text,
                }
            )

        total_ms = int((time.perf_counter() - started) * 1000)
        return {
            "segments": translated,
            "provider": "argos",
            "fallbackUsed": False,
            "timing": {
                "totalMs": total_ms,
            },
        }
