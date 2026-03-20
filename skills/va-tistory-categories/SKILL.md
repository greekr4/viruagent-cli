---
name: va-tistory-categories
version: 1.0.0
description: "Tistory: 블로그 카테고리 목록 조회"
metadata:
  category: "command"
  provider: "tistory"
  requires:
    bins: ["viruagent-cli"]
    cliHelp: "viruagent-cli list-categories --help"
---

# va-tistory-categories — 카테고리 조회

## 사용법

```bash
npx viruagent-cli list-categories --provider tistory
```

카테고리가 지정되지 않은 경우, 사용자에게 어떤 카테고리를 사용할지 질문.

## 응답 예시

```json
{
  "ok": true,
  "data": [
    { "id": "123", "name": "개발" },
    { "id": "456", "name": "일상" }
  ]
}
```

## See Also

va-tistory, va-tistory-publish
