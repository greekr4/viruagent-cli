---
name: viruagent-orchestrator
description: "viruagent-cli 개발 파이프라인을 조율하는 오케스트레이터. AdVooster 코드 분석 → 프로바이더 구현 → 스킬 생성 → QA 검증을 순차 실행. '카페 기능 추가', '프로바이더 포팅', 'AdVooster 기능 가져와', '새 기능 개발 파이프라인' 등을 언급하면 이 스킬을 사용할 것."
---

# viruagent-cli Development Orchestrator

AdVooster에서 기능을 분석하고 viruagent-cli에 구현하는 전체 파이프라인을 조율한다.

## 실행 모드: 서브 에이전트

## 에이전트 구성

| 에이전트 | 에이전트 정의 | 역할 | 스킬 | 출력 |
|---------|-------------|------|------|------|
| advooster-analyzer | `.claude/agents/advooster-analyzer.md` | AdVooster 코드 분석 | advooster-analyze | `_workspace/01_analysis.md` |
| provider-builder | `.claude/agents/provider-builder.md` | 프로바이더 코드 구현 | provider-build | `src/providers/` 코드 |
| skill-writer | `.claude/agents/skill-writer.md` | 스킬 파일 생성 | skill-write | `skills/` 파일 |
| qa-verifier | `.claude/agents/qa-verifier.md` | 변경사항 검증 | qa-verify | `_workspace/qa_result.md` |

## 워크플로우

### Phase 1: 준비
1. 사용자 요청에서 포팅할 기능을 파악한다 (예: "카페 API", "카페 가입")
2. 작업 디렉토리에 `_workspace/` 생성
3. 요청 내용을 `_workspace/00_request.md`에 기록

### Phase 2: AdVooster 분석 (advooster-analyzer)

**실행 방식:** 순차 — 분석 결과가 구현의 입력이 됨

```
Agent(
  name: "advooster-analyzer",
  prompt: "<에이전트 정의 읽기> + <스킬 읽기> + 분석 대상 모듈 지정",
  model: "opus",
  run_in_background: false
)
```

에이전트는 AdVooster의 해당 Python 파일들을 읽고 분석 결과를 `_workspace/01_analysis.md`에 저장한다.

### Phase 3: 프로바이더 구현 (provider-builder)

분석 결과를 기반으로 viruagent-cli 프로바이더 코드를 구현한다.

```
Agent(
  name: "provider-builder",
  prompt: "<에이전트 정의 읽기> + <스킬 읽기> + _workspace/01_analysis.md 읽기 + 구현 지시",
  model: "opus",
  run_in_background: false
)
```

구현 범위:
- `src/providers/{name}/` 하위 파일 생성/수정
- `src/services/providerManager.js` 등록
- `src/runner.js` 커맨드 추가
- `bin/index.js` CLI 정의 추가

### Phase 4: 스킬 생성 (skill-writer)

새로 구현된 기능에 대한 스킬 파일을 생성한다.

```
Agent(
  name: "skill-writer",
  prompt: "<에이전트 정의 읽기> + <스킬 읽기> + 구현된 기능 확인 + 스킬 생성 지시",
  model: "opus",
  run_in_background: false
)
```

### Phase 5: QA 검증 (qa-verifier)

변경사항 전체를 검증한다.

```
Agent(
  name: "qa-verifier",
  prompt: "<에이전트 정의 읽기> + <스킬 읽기> + 검증 대상 파일 목록 + 검증 실행",
  model: "opus",
  run_in_background: false
)
```

### Phase 6: 정리
1. `_workspace/` 보존 (감사 추적용)
2. 사용자에게 결과 요약:
   - 분석된 AdVooster 모듈
   - 생성/수정된 파일 목록
   - 추가된 CLI 커맨드
   - QA 결과 (통과/실패)

## 데이터 흐름

```
[사용자 요청]
     ↓
[advooster-analyzer] → _workspace/01_analysis.md
     ↓
[provider-builder] → src/providers/ 코드 생성
     ↓
[skill-writer] → skills/ 스킬 파일 생성
     ↓
[qa-verifier] → _workspace/qa_result.md
     ↓
[결과 요약 → 사용자]
```

## 에러 핸들링

| 상황 | 전략 |
|------|------|
| AdVooster 파일 읽기 실패 | 가용한 파일만 분석, 누락 파일 보고 |
| 분석 결과 불완전 | 사용자에게 수동 확인 요청 후 구현 진행 |
| 프로바이더 구현 중 기존 코드 충돌 | 충돌 지점 보고, 사용자 판단 대기 |
| QA 실패 항목 발생 | 실패 항목과 수정 방향 보고, 자동 수정 시도 1회 |

## 테스트 시나리오

### 정상 흐름
1. 사용자: "AdVooster의 카페 API와 카페 가입 기능을 추가해"
2. Phase 2: `cafe_api.py`, `cafe.py`, `cafe_join.py` 분석 → `_workspace/01_analysis.md`
3. Phase 3: `src/providers/naver/` 에 카페 관련 메서드 추가
4. Phase 4: `skills/va-naver-cafe/SKILL.md` 등 스킬 파일 생성
5. Phase 5: `viruagent-cli list-providers`, `--spec` 검증 통과
6. 결과: 새 커맨드 사용 가능

### 에러 흐름
1. Phase 2에서 `cafe_api.py` 파일이 없거나 읽기 실패
2. analyzer가 가용한 파일(`cafe.py`, `cafe_join.py`)만 분석
3. 분석 결과에 "cafe_api.py 분석 불가 — API 엔드포인트 수동 확인 필요" 명시
4. Phase 3에서 불완전한 분석 기반으로 구현, TODO 표시
5. 사용자에게 수동 보완 필요 항목 보고
