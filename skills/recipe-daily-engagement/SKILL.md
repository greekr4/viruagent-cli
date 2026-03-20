---
name: recipe-daily-engagement
version: 1.0.0
description: "레시피: 일일 Instagram 인게이지먼트 루틴"
metadata:
  category: "recipe"
  requires:
    skills: ["va-insta-feed", "va-insta-like", "va-insta-comment", "va-insta-follow"]
---

# recipe-daily-engagement — 일일 인게이지먼트 루틴

Instagram에서 매일 수행하는 인게이지먼트 루틴.

## Steps

### 1. 상태 확인
```bash
npx viruagent-cli status --provider insta
npx viruagent-cli rate-limit-status --provider insta
```

### 2. 피드 인게이지먼트
recipe-engage-feed 워크플로우 실행.
- 피드에서 5~10개 게시물에 좋아요 + 댓글

### 3. 타겟 사용자 인게이지먼트
특정 사용자 계정 방문:
```bash
npx viruagent-cli list-posts --provider insta --username <target> --limit 5
```
- 최근 게시물 3~5개에 좋아요
- 1~2개에 맥락 댓글

### 4. 신규 팔로우 (선택)
관련 분야 사용자 1~3명 팔로우:
```bash
npx viruagent-cli follow --provider insta --username <user>
```

### 5. 결과 보고
- 총 좋아요 수
- 총 댓글 수
- 신규 팔로우 수
- 남은 일일 한도

## 일일 권장 활동량

| 액션 | 권장량 | 일일 한도 |
|------|--------|-----------|
| 좋아요 | 30~50 | 500 |
| 댓글 | 5~10 | 100 |
| 팔로우 | 1~5 | 250 |

## See Also

recipe-engage-feed, va-insta, persona-influencer-manager
