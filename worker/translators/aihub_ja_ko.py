from __future__ import annotations

import time
from typing import Dict, List, Tuple


class AihubJapaneseKoreanTranslator:
    def __init__(self) -> None:
        self._source_tokenizer = None
        self._target_tokenizer = None
        self._model = None

    def _ensure_loaded(self) -> int:
        if self._model is not None and self._source_tokenizer is not None and self._target_tokenizer is not None:
            return 0

        load_started = time.perf_counter()

        from transformers import (
            BertJapaneseTokenizer,
            EncoderDecoderModel,
            PreTrainedTokenizerFast,
        )

        encoder_model_name = "cl-tohoku/bert-base-japanese-v2"
        decoder_model_name = "skt/kogpt2-base-v2"

        self._source_tokenizer = BertJapaneseTokenizer.from_pretrained(encoder_model_name)
        self._target_tokenizer = PreTrainedTokenizerFast.from_pretrained(decoder_model_name)
        self._model = EncoderDecoderModel.from_pretrained("sappho192/aihub-ja-ko-translator")

        return int((time.perf_counter() - load_started) * 1000)

    def translate_segments(self, segments: List[Dict[str, object]]) -> Tuple[List[Dict[str, object]], Dict[str, int]]:
        total_started = time.perf_counter()
        model_load_ms = self._ensure_loaded()

        if self._source_tokenizer is None or self._target_tokenizer is None or self._model is None:
            raise RuntimeError("TRANSLATION_MODEL_LOAD_FAILED:AIHub Japanese model is not initialized.")

        inference_started = time.perf_counter()
        translated: List[Dict[str, object]] = []

        for segment in segments:
            text = str(segment["text"])
            embedding = self._source_tokenizer(
                text,
                return_attention_mask=False,
                return_token_type_ids=False,
                return_tensors="pt",
            )
            output_tokens = self._model.generate(**embedding, max_length=500)[0, 1:-1]
            translated_text = self._target_tokenizer.decode(output_tokens.cpu()).strip()
            translated.append(
                {
                    "sequence": int(segment["sequence"]),
                    "translatedText": translated_text,
                }
            )

        inference_ms = int((time.perf_counter() - inference_started) * 1000)
        total_ms = int((time.perf_counter() - total_started) * 1000)
        timing = {
            "modelLoadMs": model_load_ms,
            "inferenceMs": inference_ms,
            "totalMs": total_ms,
        }
        return translated, timing
