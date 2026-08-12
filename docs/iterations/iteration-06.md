# Iteration 06 - Japanese Direct Translation Quality Upgrade

## 문제
- Argos 기반 `ja -> en -> ko` pivot 경로는 동작은 안정적이지만 일본어 자막 품질이 부자연스러운 사례가 반복되었다.
- 예: `明日は雨が降るかもしれません。`의 Argos pivot 결과가 `그것은 내일 비일지도 모릅니다.`처럼 어색하게 생성됨.

## 목표
- 일본어 입력(`sourceLanguage=ja`)은 AIHub direct model을 우선 사용한다.
- AIHub 실패 시 Argos fallback을 명시적으로 수행한다.
- provider/fallback/timing을 관측 가능하게 남긴다.

## 라우팅 구조
- `ja -> ko`: AIHub direct 우선
- AIHub 실패: Argos fallback (`ja -> en -> ko`)
- `en/ru/zh -> ko`: Argos 경로 유지

## 구현 요약
- Worker `TRANSLATE`는 아래 번역기 라우터를 사용한다.
  - `worker/translators/aihub_ja_ko.py`
  - `worker/translators/argos_translator.py`
  - `worker/translate.py` (routing + fallback + timing)
- `TRANSLATE_RESULT` payload는 optional metadata를 포함한다.
  - `provider`
  - `fallbackUsed`
  - `fallbackReason`
  - `timing { modelLoadMs?, inferenceMs?, totalMs }`

## 측정 결과
- AIHub direct (3문장, 첫 로드):
  - `modelLoadMs=5202`
  - `inferenceMs=1214`
  - `totalMs=6417`
- AIHub direct (동일 프로세스 캐시 로드):
  - `modelLoadMs=0`
  - `inferenceMs=1008`
  - `totalMs=1008`
- One-shot Worker(요청별 프로세스) 2회 연속 호출:
  - call1 `modelLoadMs=5013`, `inferenceMs=565`, `totalMs=5579`
  - call2 `modelLoadMs=5084`, `inferenceMs=562`, `totalMs=5646`
  - 해석: 다운로드 캐시는 재사용되지만 모델 로드는 요청마다 다시 발생한다.

## 품질 비교 (샘플)
- 입력: `明日は雨が降るかもしれません。`
  - AIHub: `내일은 비가 올지도 몰라요.`
  - Argos pivot: `그것은 내일 비일지도 모릅니다.`
- 입력: `この店のコーヒーはとてもおいしいです。`
  - AIHub: `이 가게의 커피는 아주 맛있어요.`
  - Argos pivot: `커피는 매우 맛있습니다.`

## demo-ja E2E 재검증
- `demo-ja.mp4` 재실행 결과:
  - `PROBING -> TRANSCRIBING -> TRANSLATING -> POST_PROCESSING -> VALIDATING -> EXPORTING -> COMPLETED`
  - 최종 상태: `COMPLETED / EXPORTING / 100`
  - translating 이벤트: `Translation provider: aihub-ja-ko.`
  - fallback 미사용(`fallbackUsed=false`)

## one-shot Worker 한계
- 현재 구조는 요청마다 AIHub 모델 로드 비용이 반복된다.
- 캐시 다운로드는 이득이 있지만 요청별 메모리 로드는 회피되지 않는다.

## 다음 최적화 후보
- persistent translation worker 도입 여부 검토
- ja 세그먼트 batch generation 최적화
- translation timeout/queue 정책 튜닝
