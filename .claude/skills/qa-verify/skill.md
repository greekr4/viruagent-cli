---
name: qa-verify
description: "viruagent-cli의 변경사항을 검증한다. CLI 명령어 실행 테스트, 코드 구조 일관성 확인, 프로바이더 패턴 준수 여부를 점검. '검증', '테스트', 'QA', '확인해줘', 'verify' 등을 언급하면 이 스킬을 사용할 것."
---

# QA Verifier

viruagent-cli 변경사항의 품질을 검증한다.

## 검증 영역

### 1. 코드 구조 검증
- 프로바이더 파일 구조 (`index.js`, `auth.js`, `session.js`, `apiClient.js`)
- `createXxxProvider` 팩토리 패턴 준수
- CommonJS export 확인
- providerManager에 등록 확인

### 2. CLI 연결 검증
- `src/runner.js`의 switch-case에 커맨드 등록 확인
- `bin/index.js`의 commander 커맨드 정의 확인
- `--spec` 출력에 새 커맨드 포함 확인

### 3. 실행 검증
```bash
# 프로바이더 목록 확인
npx viruagent-cli list-providers

# 커맨드 스펙 확인
npx viruagent-cli {command} --spec

# dry-run 테스트 (write 커맨드)
npx viruagent-cli {command} --dry-run --provider {name}
```

### 4. 경계면 교차 비교
runner.js의 커맨드명 ↔ bin/index.js의 커맨드명 ↔ 프로바이더의 메서드명이 모두 일치하는지 확인한다.

## 검증 실행 방법

1. 변경된 파일 목록을 확인 (`git diff --name-only`)
2. 파일별로 해당 검증 항목을 실행
3. 결과를 `_workspace/qa_result.md`에 기록
4. 실패 항목이 있으면 구체적 수정 방향 제시
