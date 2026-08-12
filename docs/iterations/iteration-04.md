# Iteration 04

## 목표
- Whisper로 생성된 원문 segment를 SQLite의 canonical data로 유지한다.
- 각 segment의 `source_text`를 읽어 한국어로 번역한다.
- 결과를 `segments.translated_text`에 안전하게 저장한다.
- Job pipeline을 `PROBING -> TRANSCRIBING -> TRANSLATING` 흐름으로 확장한다.
- 중간 단계에서 `COMPLETED`를 찍지 않고, 최종 EXPORTING 단계 전에는 `RUNNING` 상태를 유지한다.

## 범위
- `TranslatorProvider` abstraction 추가
- `LocalTranslatorProvider` 구현
- SegmentRepository의 atomic translation update 추가
- PipelineOrchestrator의 `runTranslation()` 연결
- Job status / current_step / progress 정책 수정
- Job Detail에서 원문 + 한국어 번역 표시
- 테스트로 실패/성공/sequence validation 검증

## TranslatorProvider abstraction
- SubForge 내부에는 `TranslatorProvider` 인터페이스만 노출한다.
- Pipeline은 Provider 구현 세부사항을 알지 않는다.
- 실제 구현은 로컬/외부 번역 엔진에 관계없이 동일한 입력/출력 contract를 따른다.

## 선택한 Provider
- 현재 구현: `LocalTranslatorProvider`
- 이유: 추가 설정 없이 현재 프로젝트 환경에서 바로 동작하는 방식이 필요했고, 외부 API key/설정이 준비되어 있지 않다.
- 구조: `src/main/translation` 아래에 provider/interface/service 분리

## Pipeline 변경
1. WAITING -> RUNNING / PROBING
2. ffprobe 성공
3. RUNNING / TRANSCRIBING
4. Whisper transcription 성공
5. SQLite `segments` 저장
6. RUNNING / TRANSLATING
7. `source_text` 기준 번역 실행
8. `translated_text` 일괄 저장
9. progress를 70 정도로 유지

## translated_text persistence
- `source_text`는 변경하지 않는다.
- 각 segment는 `sequence`, `start_ms`, `end_ms`, `source_text`, `translated_text`를 유지한다.
- 번역 저장은 DB transaction으로 처리한다.
- validation 실패 시 전체 저장을 rollback한다.

## Atomic update
- SegmentRepository `updateTranslations()`는 sequence 기반으로 validated 결과만 반영한다.
- 중복 sequence, 누락 sequence, 빈 문자열이 있으면 `INVALID_TRANSLATION_RESULT`를 발생시킨다.
- 트랜잭션 안에서 각 sequence update를 수행하여 일부만 반영되는 partial 상태를 방지한다.

## 실패 처리
- Translation 실패 시 `FAILED`, `current_step = 'TRANSLATING'`, `error_code`, `error_message`를 저장한다.
- ERROR event를 남긴다.
- `TRANSLATOR_NOT_AVAILABLE`, `TRANSLATION_FAILED`, `TRANSLATION_TIMEOUT`, `INVALID_TRANSLATION_RESULT` 등 필요한 코드만 사용한다.

## 실제 demo-ja 결과
- 현재 구현은 원문 segment to Korean translation flow를 저장하는 구조를 정착시켰다.
- 최종 SRT export는 여기서 구현하지 않는다.
- 최종 기대 상태는 `RUNNING / TRANSLATING`이며, `COMPLETED`는 향후 EXPORTING 성공 시점에만 사용한다.

## 다음 단계
- SRT export 구현
- POST_PROCESSING / VALIDATING / EXPORTING pipeline 연결
- quality validation 및 gap recovery
