---
name: skill-write
description: "viruagent-cli의 스킬 파일(skills/ 디렉토리)을 생성하거나 업데이트한다. 프로바이더 기능 추가/변경 시 스킬 파일을 동기화. '스킬 생성', '스킬 업데이트', 'SKILL.md 작성', '스킬 동기화' 등을 언급하면 이 스킬을 사용할 것."
---

# Skill Writer

viruagent-cli 스킬 파일을 생성/업데이트한다.

## 스킬 파일 위치

```
skills/
├── va-shared/SKILL.md          # 라우터 스킬 (최상위)
├── va-{provider}/SKILL.md       # 프로바이더 개요
├── va-{provider}-{action}/SKILL.md  # 개별 액션
├── persona-{name}/SKILL.md      # 페르소나
└── recipe-{name}/SKILL.md       # 레시피 (복합 워크플로우)
```

## 스킬 작성 규칙

### YAML Frontmatter
```yaml
---
name: va-{provider}-{action}
description: "viruagent-cli {설명}..."
---
```

### 본문 필수 섹션
1. **선행 조건** — 로그인 필요 여부, 환경변수
2. **실행** — CLI 명령어 (`npx viruagent-cli {command} --provider {name}`)
3. **파라미터** — 테이블 형식, 필수/선택 구분
4. **에러 처리** — 에러 코드 → 조치 매핑
5. **예시** — 구체적 사용 예시 1~2개

### 라우터 스킬 업데이트
새 프로바이더/기능 추가 시 `skills/va-shared/SKILL.md`의 라우팅 테이블에 항목을 추가한다. 기존 항목은 건드리지 않는다.

## 주의사항

- 기존 스킬의 포맷/스타일과 일관성을 유지한다
- 과도한 설명 금지 — AI 에이전트가 CLI를 사용하는 데 필요한 최소 정보만
- `--spec` 명령어로 CLI 스펙을 확인한 뒤 스킬을 작성한다
