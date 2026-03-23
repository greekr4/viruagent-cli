---
name: va-insta
version: 1.0.0
description: "Instagram 자동화: 명령 개요 및 레이트리밋 규칙"
metadata:
  category: "overview"
  provider: "insta"
  requires:
    bins: ["viruagent-cli"]
---

# va-insta — Instagram 자동화 개요

Instagram 자동화를 위한 viruagent-cli 가이드. 항상 `--provider insta` 사용.

## 명령 목록

| 명령 | 스킬 | 설명 |
|------|------|------|
| login | va-insta-login | 로그인 + 챌린지 해결 |
| publish | va-insta-publish | 게시물 발행 (어그로 전략 포함) |
| like, unlike | va-insta-like | 좋아요/좋아요 취소 |
| comment | va-insta-comment | 댓글 작성 |
| follow, unfollow | va-insta-follow | 팔로우/언팔로우 |
| send-dm, list-messages | va-insta-dm | DM 보내기/목록 |
| get-feed, get-profile, list-posts, analyze-post | va-insta-feed | 피드/프로필/분석 |

## Rate Limit Safety (신규 계정 기준)

| 액션 | 딜레이 | 시간당 | 일일 |
|------|--------|--------|------|
| Like | 20~40s | 15 | 500 |
| Comment | 5~7min | 5 | 100 |
| Follow | 1~2min | 15 | 250 |
| Unfollow | 1~2min | 10 | 200 |
| DM | 2~5min | 5 | 30 |
| Post | 1~2min | 3 | 25 |

모든 딜레이는 랜덤화되어 자동 적용. 카운터는 세션별 userId로 영속화.

## 레이트리밋 확인

```bash
npx viruagent-cli rate-limit-status --provider insta
```

대량 작업 전 반드시 확인.

## 중요 사항

- 신규 계정 (< 20일)은 제한이 더 엄격
- 균일한 액션 간격은 봇 감지 트리거 — 딜레이는 랜덤화됨
- challenge 발생 시 브라우저에서 본인 인증 필요
- 세션 + 카운터: `~/.viruagent-cli/sessions/insta-session.json`

## 환경변수

```
INSTA_USERNAME=
INSTA_PASSWORD=
```

## See Also

va-shared, va-insta-login, va-insta-publish, va-insta-like, va-insta-comment, va-insta-follow, va-insta-dm, va-insta-feed
