# Iteration 02

## 목표
Persistent Queue에 저장된 WAITING Job 하나를 Electron Main에서 실행해 Python Worker + ffprobe로 media probing을 수행하고, 결과/실패를 Job 상태와 이벤트로 안전하게 반영한다.

## 범위
- Queue tick 실행 진입점
- WAITING -> RUNNING 전이
- currentStep = PROBING 설정
- Python Worker one-shot 실행
- JSON protocol(Electron <-> Python)
- ffprobe 결과 파싱 및 ProbeMetadata 생성
- 성공/실패 event 기록
- 앱 재시작 시 RUNNING job recovery
- 단일 동시성 유지(MAX_CONCURRENT_JOBS = 1)

## 구현 구조
- Electron Main
  - JobService.tick()
  - PipelineOrchestrator.runProbe()
  - PythonWorkerClient.probe()
- Python Worker
  - worker/main.py: protocol entrypoint
  - worker/probe.py: ffprobe 호출/파싱
  - worker/protocol.py: response 구조

## Worker Protocol
요청 예시:
- {"requestId":"...","type":"PROBE","payload":{"sourcePath":"D:\\Media\\demo-ja.mp4"}}

응답 정책:
- stdout: JSON protocol 전용
- stderr: 진단 로그 전용
- 한 줄 JSON 한 메시지(JSONL)

## Probe Flow
1. JobService가 scheduler로 next WAITING 선택
2. PipelineOrchestrator가 job을 RUNNING/PROBING으로 전이
3. INFO event 기록
4. PythonWorkerClient가 worker/main.py 실행
5. worker가 ffprobe 실행 후 metadata JSON 반환
6. 성공 시 INFO event(Media probing completed.) 기록
7. 실패 시 FAILED + error_code/error_message + ERROR event 기록

## RUNNING Recovery 정책
앱 시작 시 기존 RUNNING job은 실제 worker가 사라졌을 수 있으므로 WAITING으로 복구한다.
- status: RUNNING -> WAITING
- currentStep: null
- progress: 0
- started_at: null
- WARNING event 추가

복구 후 scheduler를 트리거해 다시 PROBING부터 시작한다.

## Worker 실행 전략 결정
Iteration 02에서는 one-shot worker(process per request)를 채택했다.
- 이유: 구현 단순성, failure isolation, 초반 안정화에 유리
- 이후 Whisper 모델 상주 최적화가 필요해지면 persistent worker로 확장 예정

## 테스트
- worker protocol parser
- pipeline orchestrator 상태 전이/실패 처리
- JobService recovery/tick/single concurrency

## 미구현 범위
Whisper, VAD, STT, Translation, SRT 생성, Segment 처리, Pipeline 후속 단계

## 다음 단계
- persistent worker 전환 검토
- ProbeMetadata의 DB 저장 방식(신규 migration) 검토
- PROBING 이후 다음 step orchestration 추가
