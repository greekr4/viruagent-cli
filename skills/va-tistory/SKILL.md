---
name: va-tistory
version: 1.0.0
description: "Tistory 블로그: 명령 개요 및 플랫폼 특화 규칙"
metadata:
  category: "overview"
  provider: "tistory"
  requires:
    bins: ["viruagent-cli"]
---

# va-tistory — Tistory 블로그 개요

Tistory 블로그 퍼블리싱을 위한 viruagent-cli 가이드. 항상 `--provider tistory` 사용.

## 명령 목록

| 명령 | 스킬 | 설명 |
|------|------|------|
| login | va-tistory-login | 카카오 로그인 (2FA 포함) |
| publish | va-tistory-publish | 글 발행 |
| save-draft | va-tistory-draft | 임시저장 |
| list-categories | va-tistory-categories | 카테고리 조회 |
| list-posts, read-post | va-tistory-posts | 글 목록/읽기 |

## Tistory HTML 규칙

Tistory는 `data-ke-*` 속성을 사용합니다:
- 본문: `<p data-ke-size="size18">`
- 여백: `<p data-ke-size="size16">&nbsp;</p>`
- 인용: `<blockquote data-ke-style="style2">`

## 환경변수

```
TISTORY_USERNAME=
TISTORY_PASSWORD=
```

## See Also

va-shared, va-tistory-login, va-tistory-publish, va-tistory-draft, va-tistory-categories, va-tistory-posts
