---
name: va-naver-posts
version: 1.0.0
description: "Naver: 글 목록 조회 및 개별 글 읽기"
metadata:
  category: "command"
  provider: "naver"
  requires:
    bins: ["viruagent-cli"]
    cliHelp: "viruagent-cli list-posts --help"
---

# va-naver-posts — 글 목록 & 읽기

## 글 목록

```bash
npx viruagent-cli list-posts --provider naver --limit 10
```

| 플래그 | 설명 | 기본값 |
|--------|------|--------|
| `--limit` | 조회할 글 수 | 20 |

## 글 읽기

```bash
npx viruagent-cli read-post --provider naver --post-id <id>
```

| 플래그 | 설명 |
|--------|------|
| `--post-id` | 글 ID |
| `--include-draft` | 임시저장 포함 |

## See Also

va-naver, va-shared
