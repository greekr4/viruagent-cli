---
name: va-threads
version: 1.0.0
description: "Threads 자동화: 명령 개요 및 레이트리밋 규칙"
metadata:
  category: "overview"
  provider: "threads"
  requires:
    bins: ["viruagent-cli"]
---

# va-threads — Threads 자동화 개요

Threads 자동화를 위한 viruagent-cli 가이드. 항상 `--provider threads` 사용.

## 명령 목록

| 명령 | 스킬 | 설명 |
|------|------|------|
| login | va-threads | 로그인 (Instagram 계정) |
| publish | va-threads-publish | 글쓰기 (텍스트/이미지) |
| like | va-threads | 좋아요 |
| comment | va-threads | 답글 |
| follow | va-threads | 팔로우 |
| search | va-threads | 검색 |
| get-profile | va-threads | 프로필 조회 |
| get-feed | va-threads | 피드 조회 |

## Rate Limit Safety (신규 계정 기준)

| 액션 | 딜레이 | 시간당 | 일일 |
|------|--------|--------|------|
| Post | 2~5min | 5 | 25 |
| Like | 20~40s | 15 | 500 |
| Reply | 5~7min | 5 | 100 |
| Follow | 1~2min | 15 | 250 |

모든 딜레이는 랜덤화되어 자동 적용. 카운터는 세션별 userId로 영속화.

## 레이트리밋 확인

```bash
npx viruagent-cli rate-limit-status --provider threads
```

대량 작업 전 반드시 확인.

## 중요 사항

- Instagram 계정을 공유하므로 Instagram rate limit에 영향을 줄 수 있음
- Barcelona User-Agent + Bloks API 사용
- IGT:2 토큰이 주요 인증 수단
- 세션 + 카운터: `~/.viruagent-cli/sessions/threads-session.json`

## 환경변수

```
THREADS_USERNAME=
THREADS_PASSWORD=
# 또는
INSTA_USERNAME=
INSTA_PASSWORD=
```

## See Also

va-shared, va-threads-publish
