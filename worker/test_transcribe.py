import unittest

from transcribe import _normalize_segments


class FakeSegment:
    def __init__(self, text: str, start: float, end: float):
        self.text = text
        self.start = start
        self.end = end


class NormalizeSegmentsTests(unittest.TestCase):
    def test_accepts_faster_whisper_segment_objects(self):
        segments = [FakeSegment('こんにちは。', 0.5, 1.5)]

        normalized = _normalize_segments(segments)

        self.assertEqual(len(normalized), 1)
        self.assertEqual(normalized[0]['text'], 'こんにちは。')
        self.assertEqual(normalized[0]['startMs'], 500)
        self.assertEqual(normalized[0]['endMs'], 1500)

    def test_accepts_dict_segments(self):
        segments = [{
            'text': 'テスト',
            'start': 1.0,
            'end': 2.0,
        }]

        normalized = _normalize_segments(segments)

        self.assertEqual(len(normalized), 1)
        self.assertEqual(normalized[0]['text'], 'テスト')
        self.assertEqual(normalized[0]['startMs'], 1000)
        self.assertEqual(normalized[0]['endMs'], 2000)


if __name__ == '__main__':
    unittest.main()
