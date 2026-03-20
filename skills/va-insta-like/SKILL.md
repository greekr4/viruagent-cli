---
name: va-insta-like
version: 1.0.0
description: "Instagram: 게시물 좋아요/좋아요 취소, 댓글 좋아요"
metadata:
  category: "command"
  provider: "insta"
  requires:
    bins: ["viruagent-cli"]
    cliHelp: "viruagent-cli like --help"
---

# va-insta-like — 좋아요

## 게시물 좋아요

```bash
npx viruagent-cli like --provider insta --post-id <shortcode>
```

## 게시물 좋아요 취소

```bash
npx viruagent-cli unlike --provider insta --post-id <shortcode>
```

## 댓글 좋아요

```bash
npx viruagent-cli like-comment --provider insta --comment-id <id>
```

## 댓글 좋아요 취소

```bash
npx viruagent-cli unlike-comment --provider insta --comment-id <id>
```

## Rate Limit

| 액션 | 딜레이 | 시간당 | 일일 |
|------|--------|--------|------|
| Like | 20~40s | 15 | 500 |

딜레이는 자동 랜덤 적용.

## 워크플로우: 사용자 게시물 모두 좋아요

1. `list-posts --provider insta --username <user> --limit 20`
2. 각 게시물: `like --provider insta --post-id <shortcode>`
3. 레이트리밋 딜레이 자동 적용 (20~40초)

## See Also

va-insta, va-insta-comment, va-insta-feed
