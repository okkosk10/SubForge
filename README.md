# SubForge

SubForge는 외국어 미디어 파일을 한국어 SRT로 처리하기 위한 데스크톱 애플리케이션이다.

현재 MVP 목표는 단일 미디어 파일을 한국어 SRT로 end-to-end 처리하는 것이다.

- Electron + React + TypeScript 앱 구조
- Main / Preload / Renderer 분리
- SQLite 영속성과 migration
- Job 중심 도메인 모델
- Persistent Job Queue 구조
- 기본 UI (Jobs / New Job / Job Detail / Settings)
- 자동 테스트 기반

## 핵심 정책
- 파일 1개 = Job 1개
- WAITING/RUNNING active 중복 Job 방지
- Job 상태 영속화 (앱 재시작 후 유지)
- 실패 Job 이력 보존
- AI 실행 동시성은 1로 제한 (`MAX_CONCURRENT_JOBS = 1`)

## 기술 스택
- Electron
- React
- TypeScript
- Vite
- SQLite (`better-sqlite3`)
- ESLint
- Prettier
- Vitest

## 시작
```bash
npm install
npm run dev
```

## 품질 검증
```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## 디렉터리 개요
```text
src/
  main/       # Electron main, DB, repository, service, scheduler, IPC handlers
  preload/    # typed IPC bridge
  renderer/   # React UI pages/components
  shared/     # main/preload/renderer 공용 타입
docs/
  decisions/  # ADR
  iterations/ # iteration 단위 기록
```

## 현재 MVP Flow
Media File
-> Probe
-> Whisper Transcription
-> Translation
-> PostProcess
-> Validation
-> Korean SRT Export

## 현재 범위
구현됨:
- Media file picker 기반 Job 생성
- source language 선택 (`ja`, `en`, `ru`, `zh`)
- Jobs 목록/필터/상세
- SQLite migration + Job/Event/Segment 스키마
- Queue scheduler 단일 동시성 구조
- Pipeline: `PROBING -> TRANSCRIBING -> TRANSLATING -> POST_PROCESSING -> VALIDATING -> EXPORTING -> COMPLETED`
- UTF-8 `.ko.srt` 파일 export

번역 엔진 메모:
- 일본어(`ja`)는 local direct model `sappho192/aihub-ja-ko-translator`를 우선 사용하고, 실패 시 local Argos 경로로 fallback한다.
- 모델/데이터 사용 조건은 해당 모델 카드 및 AIHub 안내를 확인한다.

미구현 (의도된 범위 제외):
- 고급 품질 보정(반복 제거, 의미 재작성, AI 후처리)
- Folder batch import
- DriveAtlas integration
- 고급 편집 UI

상세 설계는 `docs/` 문서를 참고한다.
