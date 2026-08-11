# ADR 003: Single Concurrency 정책

## 상태
Accepted

## 결정
AI execution concurrency를 1로 제한한다.

## 근거
Whisper 계열 작업은 GPU/VRAM/메모리 사용량이 높고, 다중 병렬 실행 시 시스템 안정성이 저하될 수 있다.

## 정책
- Job은 독립적으로 큐에 적재
- 실제 실행 슬롯은 1개 (`MAX_CONCURRENT_JOBS = 1`)

## 결과
- 안정성 우선 운영
- Scheduler 책임 명확화
- 향후 자원 정책 기반 확장 가능
