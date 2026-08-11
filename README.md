# SubForge

SubForge는 외국어 미디어 파일을 한국어 SRT로 처리하기 위한 데스크톱 애플리케이션이다.

Iteration 01의 목표는 AI 파이프라인 기능 구현이 아니라, 다음 확장을 안정적으로 수용하는 기술 골격 검증이다.

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

## 현재 범위 (Iteration 01)
구현됨:
- Media file picker 기반 Job 생성
- source language 선택 (`ja`, `en`, `ru`, `zh`)
- Jobs 목록/필터/상세
- SQLite migration + Job/Event/Segment 스키마
- Queue scheduler 단일 동시성 구조

미구현 (의도된 범위 제외):
- Whisper / FFmpeg / VAD / STT / 번역 / SRT 생성
- Folder batch import
- DriveAtlas integration
- 고급 편집 UI

상세 설계는 `docs/` 문서를 참고한다.
