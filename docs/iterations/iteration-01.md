# Iteration 01

## 목표
AI 기능을 구현하기 전에 Persistent Job Queue와 데스크톱 애플리케이션 기술 골격을 검증한다.

## 완료 체크리스트
- [x] Electron + React + TypeScript 초기 구조
- [x] Main / Preload / Renderer 분리
- [x] SQLite Migration
- [x] Job CRUD
- [x] Media File Picker
- [x] Source Language Selection
- [x] Jobs 화면
- [x] Job Detail
- [x] Persistent Job Queue
- [x] Single Concurrency Scheduler 구조
- [x] 앱 재시작 후 Job 복원
- [x] 기본 테스트

## 제외 범위 재확인
Whisper, FFmpeg, VAD, STT, 번역, SRT 생성 등 AI 파이프라인 실제 처리는 본 iteration에 포함하지 않는다.
