# Iteration 05

## 목표
- 번역된 canonical segment를 deterministic 후처리한다.
- SRT export 전 validation으로 최소 안전성을 검증한다.
- 실제 `.ko.srt` 파일을 생성하고 Job을 `COMPLETED / 100%`로 종료한다.
- SubForge 첫 end-to-end 기술 사이클을 완성한다.

## 범위
- Pipeline 확장: `PROBING -> TRANSCRIBING -> TRANSLATING -> POST_PROCESSING -> VALIDATING -> EXPORTING`
- `subtitlePostProcessor` 추가 (AI 호출 없음)
- `subtitleValidator` 추가
- `srtExporter` 추가 (`utf8` 저장)
- Queue continuation 보강 (단일 동시성 유지)

## PostProcess 규칙
- 앞뒤 공백 제거
- 연속 공백 1칸으로 정규화
- `.`, `?`, `!` 뒤에 공백이 없으면 기본 보정
- 소수점(`3.14`) 같은 숫자 패턴에는 보정 비적용
- 이번 MVP에서는 결과를 `segments.translated_text`에 덮어쓴다.

## Validation 정책
- segment 개수 1개 이상
- sequence는 음수/중복 불가
- `start_ms >= 0`
- `end_ms > start_ms`
- `translated_text` 존재 + `trim()` 결과 비어있지 않음
- 시작 timestamp는 오름차순(`current.start_ms >= previous.start_ms`)

## SRT serialization
- 출력 번호는 DB sequence와 분리하여 `1..N`으로 생성
- 각 block 형식:
  1) index
  2) `HH:MM:SS,mmm --> HH:MM:SS,mmm`
  3) 번역 본문
  4) 빈 줄

## Export 정책
- Job의 기존 `outputPath`를 그대로 사용
- output directory 미존재 시 `EXPORT_FAILED`
- UTF-8로 파일 저장
- `.tmp` 파일에 먼저 write 후 rename 시도
- 기존 파일은 overwrite 허용

## COMPLETED 의미
- `status=COMPLETED`, `progress=100`, `completed_at!=null`은 오직 export 성공 이후에만 설정
- 최종 step은 `EXPORTING` 유지

## Queue continuation
- `tick()`이 queue를 순차적으로 소진하도록 확장
- A 완료 후 B가 자동 진행됨
- A 실패(`FAILED`)여도 B는 같은 tick 흐름에서 이어서 처리 가능
- single concurrency(`MAX_CONCURRENT_JOBS=1`)는 유지

## 실제 demo-ja 결과
- 기대 이벤트:
  - Job created and queued.
  - Job processing started.
  - Media probing started/completed.
  - Transcription started/completed.
  - Translation started/completed.
  - Subtitle post-processing started/completed.
  - Subtitle validation started/completed.
  - Subtitle export started/completed.

## 첫 end-to-end cycle 회고
- Whisper/번역 단계까지 만든 canonical data를 deterministic export 단계와 분리함으로써 안정성을 높였다.
- `COMPLETED` 의미가 명확해져 운영/디버깅 해석이 쉬워졌다.

## 다음 단계
- 번역 품질 향상(반복/어투/문맥)
- validation warning 레벨(중첩 구간 등) 강화
- raw translation과 final subtitle text schema 분리 검토
- export 실패 재시도 정책 검토
