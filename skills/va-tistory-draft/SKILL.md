---
name: va-tistory-draft
version: 1.0.0
description: "Tistory: 블로그 글 임시저장"
metadata:
  category: "command"
  provider: "tistory"
  requires:
    bins: ["viruagent-cli"]
    cliHelp: "viruagent-cli save-draft --help"
---

# va-tistory-draft — Tistory 임시저장

## 사용법

```bash
npx viruagent-cli save-draft \
  --provider tistory \
  --title "Draft Title" \
  --content "<h2>...</h2><p>...</p>" \
  --category <id> \
  --tags "tag1,tag2,tag3,tag4,tag5" \
  --related-image-keywords "keyword1,keyword2"
```

`publish` 대신 `save-draft` 사용. 옵션은 동일.

## See Also

va-tistory-publish, va-tistory, va-shared
