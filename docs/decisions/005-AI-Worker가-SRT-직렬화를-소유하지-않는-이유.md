# ADR 005: AI Worker가 SRT 직렬화를 소유하지 않는 이유

## 상태
Proposed

## 결정
Whisper와 같은 AI Worker는 원문/타임스탬프 구조를 반환하고, SQLite에서 canonical segment 저장을 담당한다. SRT 직렬화는 이후 Subtitle Exporter 단계에서만 수행한다.

## 근거
- 구조화된 transcription 결과는 DB와 재사용이 쉬움
- 타임스탬프와 텍스트는 AI worker가 가장 잘 이해하는 도메인
- 번역/검증/내보내기 단계는 서로 다른 책임을 가지며 분리되어야 함
- SRT formatting은 export-only concern이며 현재 iteration 범위를 넘지 않는다

## 적용
- `source_text`는 Whisper 원문
- `translated_text`는 이후 Translation 단계에서만 채움
- Export 단계에서만 `.srt` 생성

## 향후 방향
- Translation 및 export pipeline이 추가되면, 직렬화 로직은 별도 모듈로 분리한다.
