---
name: va-naver
version: 1.0.0
description: "Naver 블로그: 명령 개요 및 플랫폼 특화 규칙"
metadata:
  category: "overview"
  provider: "naver"
  requires:
    bins: ["viruagent-cli"]
---

# va-naver — Naver 블로그 개요

Naver 블로그 퍼블리싱을 위한 viruagent-cli 가이드. 항상 `--provider naver` 사용.

## 명령 목록

| 명령 | 스킬 | 설명 |
|------|------|------|
| login | va-naver-login | 네이버 로그인 (manual 모드 포함) |
| publish | va-naver-publish | 글 발행 |
| save-draft | va-naver-draft | 임시저장 (private 포스트) |
| list-categories | va-naver-categories | 카테고리 조회 |
| list-posts, read-post | va-naver-posts | 글 목록/읽기 |

## Naver HTML 규칙

Naver SE Editor는 `data-ke-*` 속성을 무시합니다:
- 본문: 일반 `<p>` 태그 사용
- 여백: `<p>&nbsp;</p>`
- 인용: 일반 `<blockquote>` — 서버에서 자동 변환
- HTML → SE Editor 컴포넌트 서버 자동 변환

## 환경변수

```
NAVER_USERNAME=
NAVER_PASSWORD=
```

## See Also

va-shared, va-naver-login, va-naver-publish, va-naver-draft, va-naver-categories, va-naver-posts
