# ADR 004: Electron Main과 Python Worker를 분리한 이유

## 상태
Accepted

## 결정
AI/미디어 분석 실행 책임은 Renderer가 아닌 Electron Main 하위의 Python Worker로 분리한다.

## 근거
- Renderer 보안 경계 유지: child_process, ffprobe 직접 실행 금지
- 장애 격리: worker 실패가 UI thread에 직접 전파되지 않음
- 향후 Whisper 도입 준비: Python 생태계 라이브러리 연동이 용이
- 확장성: one-shot worker에서 persistent worker로 진화 가능

## Iteration 02 적용
- Worker 실행 전략: one-shot process per request
- 프로토콜: JSONL(stdout)
- stderr: 진단 로그 전용
- timeout 및 비정상 종료 에러 코드 표준화

## 후속 방향
- Whisper 모델 상주시 persistent worker 전환 검토
- interpreter 경로 설정/배포 전략 정교화
