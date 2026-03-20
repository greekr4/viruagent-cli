---
name: va-tistory-posts
version: 1.0.0
description: "Tistory: 글 목록 조회 및 개별 글 읽기"
metadata:
  category: "command"
  provider: "tistory"
  requires:
    bins: ["viruagent-cli"]
    cliHelp: "viruagent-cli list-posts --help"
---

# va-tistory-posts — 글 목록 & 읽기

## 글 목록

```bash
npx viruagent-cli list-posts --provider tistory --limit 10
```

| 플래그 | 설명 | 기본값 |
|--------|------|--------|
| `--limit` | 조회할 글 수 | 20 |

## 글 읽기

```bash
npx viruagent-cli read-post --provider tistory --post-id <id>
```

| 플래그 | 설명 |
|--------|------|
| `--post-id` | 글 ID |
| `--include-draft` | 임시저장 포함 |

## See Also

va-tistory, va-shared
