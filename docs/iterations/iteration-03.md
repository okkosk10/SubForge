# Iteration 03

## 목표
Whisper transcription을 실제로 연결하고, 결과를 SQLite의 `segments` 테이블에 구조화된 형태로 영속 저장한다.

## 범위
- PROBING 이후 TRANSCRIBING 단계 연결
- Python Worker `TRANSCRIBE` request 구현
- faster-whisper 기반 transcription 실행
- source language 강제 지정
- segment timestamp 변환 및 validation
- segment repository의 transaction 기반 replace
- Job Detail에 segment 표시
- 실패 시 job 상태/ERROR event 기록

## Pipeline 변화
1. WAITING -> RUNNING / PROBING
2. ffprobe 성공
3. RUNNING / TRANSCRIBING
4. Whisper 실행
5. transcription segments 수신
6. segments 저장
7. INFO event: Transcription completed.

## Whisper 선택
- 모델: `large-v3`
- 구현 라이브러리: `faster-whisper`
- 기본 디바이스 선택: CUDA 사용 가능 시 `cuda`, 아니면 `cpu` fallback
- compute type: CUDA = `float16`, CPU = `int8`

## source language 강제 지정
- 사용자 선택값을 그대로 사용한다.
- 언어는 `ja`, `en`, `ru`, `zh`만 허용한다.
- `WhisperModel.transcribe(..., language=source_language)`로 명시 전달한다.

## segment persistence
- DB 컬럼은 `source_text`와 `translated_text = NULL` 유지
- Whisper 결과는 `source_text`에만 저장한다.
- Transcription 결과를 전체적으로 받아온 뒤 `replaceForJob()`로 교체 저장한다.

## Worker protocol 확장
- `PROBE` 유지
- `TRANSCRIBE` 추가
- 성공 응답: `TRANSCRIBE_RESULT`
- 실패 응답: `ERROR` + `WHISPER_*` code

## one-shot worker 한계
- Iteration 03에서는 one-shot worker를 유지한다.
- `large-v3`는 모델 로딩 비용이 크므로, 추후 persistent worker 전환을 위해 iteration 04 이후 성능 최적화가 필요하다.

## 테스트
- SegmentRepository replace/list 동작 검증
- pipeline success/failure 검증
- transcribe request/response 타입 검증

## 실제 demo-ja 결과
- 로컬 파일 `demo-ja.mp4`가 준비된 경우, 기대 flow는 PROBING -> TRANSCRIBING -> segments 저장까지 확인한다.
- 실제 segment 분할 수는 Whisper 결과에 따라 다르다.

## 다음 단계
- Translation 및 Korean subtitle generation
- persistent worker 전환
- VAD/quality refinement

## 의미 수정
- Iteration 03은 transcription 기능 검증 완료에 초점을 둔다.
- SubForge 전체 Job의 최종 `COMPLETED`는 EXPORTING 성공 시점 이후에만 사용한다.
- 중간 단계에서 transcription이 완료돼도 job은 `RUNNING` 상태를 유지하고, 이후 `TRANSLATING` 단계로 이어진다.
