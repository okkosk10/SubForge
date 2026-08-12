from __future__ import annotations

import os
from pathlib import Path

DEFAULT_WHISPER_MODEL = "large-v3"
SUPPORTED_SOURCE_LANGUAGES = {"ja", "en", "ru", "zh"}
DEFAULT_TRANSCRIBE_TIMEOUT_MS = 30 * 60 * 1000


def resolve_model_cache_dir() -> str:
    cache_root = os.environ.get("SUBFORGE_MODEL_CACHE_DIR")
    if cache_root:
        return cache_root

    return str(Path.home() / ".cache" / "subforge" / "whisper")
