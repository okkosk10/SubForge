# 03 범위와 MVP

## MVP (Iteration 01)
- Electron + React + TypeScript 앱 실행
- SQLite DB 생성 및 migration 적용
- jobs/segments/job_events 테이블 준비
- Job 생성/조회/상세
- Queue 단일 동시성 구조
- 기본 테스트

## 제외 범위
- Whisper/faster-whisper
- FFmpeg/VAD/Speech Analysis
- 실제 STT/번역/SRT Export
- Folder batch import
- Drag & Drop
- DriveAtlas 직접 통합

## 성공 기준
- 앱 실행 -> 파일 선택 -> Job 생성 -> Jobs/Detail 확인
- 앱 종료/재실행 후 Job 유지
- `typecheck`, `lint`, `test`, `build` 통과
