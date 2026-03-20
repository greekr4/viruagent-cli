---
name: va-insta-follow
version: 1.0.0
description: "Instagram: 사용자 팔로우/언팔로우"
metadata:
  category: "command"
  provider: "insta"
  requires:
    bins: ["viruagent-cli"]
    cliHelp: "viruagent-cli follow --help"
---

# va-insta-follow — 팔로우/언팔로우

## 팔로우

```bash
npx viruagent-cli follow --provider insta --username <username>
```

## 언팔로우

```bash
npx viruagent-cli unfollow --provider insta --username <username>
```

## Rate Limit

| 액션 | 딜레이 | 시간당 | 일일 |
|------|--------|--------|------|
| Follow | 1~2min | 15 | 250 |
| Unfollow | 1~2min | 10 | 200 |

## 워크플로우: 팔로우 + 인게이지먼트

1. `follow --provider insta --username <user>`
2. `list-posts --provider insta --username <user> --limit 20`
3. 각 게시물에 좋아요 + 댓글 (va-insta-like, va-insta-comment 참조)

## See Also

va-insta, va-insta-like, va-insta-comment
