---
name: va-naver-categories
version: 1.0.0
description: "Naver: 블로그 카테고리 목록 조회"
metadata:
  category: "command"
  provider: "naver"
  requires:
    bins: ["viruagent-cli"]
    cliHelp: "viruagent-cli list-categories --help"
---

# va-naver-categories — 카테고리 조회

## 사용법

```bash
npx viruagent-cli list-categories --provider naver
```

카테고리가 지정되지 않은 경우, 사용자에게 어떤 카테고리를 사용할지 질문.

## See Also

va-naver, va-naver-publish
