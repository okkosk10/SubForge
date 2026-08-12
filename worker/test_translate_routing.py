import unittest

import translate


class FakeAihubSuccess:
    def __init__(self):
        self.called = False

    def translate_segments(self, segments):
        self.called = True
        return ([{"sequence": s["sequence"], "translatedText": "aihub"} for s in segments], {"modelLoadMs": 10, "inferenceMs": 20, "totalMs": 30})


class FakeAihubFailure:
    def __init__(self):
        self.called = False

    def translate_segments(self, _segments):
        self.called = True
        raise RuntimeError("TRANSLATION_MODEL_LOAD_FAILED:boom")


class FakeArgos:
    def __init__(self):
        self.called = False

    def translate_segments(self, _source_language, _target_language, segments):
        self.called = True
        return {
            "segments": [{"sequence": s["sequence"], "translatedText": "argos"} for s in segments],
            "provider": "argos",
            "fallbackUsed": False,
            "timing": {"totalMs": 5},
        }


class TranslateRoutingTests(unittest.TestCase):
    def setUp(self):
        self.original_aihub = translate._aihub_translator
        self.original_argos = translate._argos_translator

    def tearDown(self):
        translate._aihub_translator = self.original_aihub
        translate._argos_translator = self.original_argos

    def test_ja_uses_aihub_primary(self):
        fake_aihub = FakeAihubSuccess()
        fake_argos = FakeArgos()
        translate._aihub_translator = fake_aihub
        translate._argos_translator = fake_argos

        result = translate.translate_segments("ja", "ko", [{"sequence": 0, "text": "明日は雨が降るかもしれません。"}])

        self.assertTrue(fake_aihub.called)
        self.assertFalse(fake_argos.called)
        self.assertEqual(result.get("provider"), "aihub-ja-ko")
        self.assertEqual(result.get("fallbackUsed"), False)

    def test_ja_falls_back_to_argos_on_aihub_failure(self):
        fake_aihub = FakeAihubFailure()
        fake_argos = FakeArgos()
        translate._aihub_translator = fake_aihub
        translate._argos_translator = fake_argos

        result = translate.translate_segments("ja", "ko", [{"sequence": 0, "text": "駅で友達を待っています。"}])

        self.assertTrue(fake_aihub.called)
        self.assertTrue(fake_argos.called)
        self.assertEqual(result.get("provider"), "argos")
        self.assertEqual(result.get("fallbackUsed"), True)
        self.assertIn("TRANSLATION_MODEL_LOAD_FAILED", result.get("fallbackReason", ""))

    def test_non_ja_uses_argos_only(self):
        fake_aihub = FakeAihubSuccess()
        fake_argos = FakeArgos()
        translate._aihub_translator = fake_aihub
        translate._argos_translator = fake_argos

        result = translate.translate_segments("en", "ko", [{"sequence": 0, "text": "I am waiting at the station."}])

        self.assertFalse(fake_aihub.called)
        self.assertTrue(fake_argos.called)
        self.assertEqual(result.get("provider"), "argos")


if __name__ == "__main__":
    unittest.main()
