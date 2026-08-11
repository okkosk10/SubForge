# ADR 002: Folder Batch가 아닌 File Job Queue를 선택한 이유

## 상태
Accepted

## 결정
처리 단위를 폴더가 아닌 파일 단위 Job으로 정의하고, Persistent Job Queue를 채택한다.

## 근거
파일별로 다음을 독립 관리해야 한다.
- 상태
- 실패
- Retry
- History
- Persistence

## 결과
- 파일 1개 = Job 1개
- 동일 파일 active 중복 방지
- 실패 Job 보존 및 추적 가능
