---
name: recipe-grow-followers
version: 1.0.0
description: "레시피: 팔로워 성장 전략 — 타겟 인게이지먼트 기반"
metadata:
  category: "recipe"
  requires:
    skills: ["va-insta-feed", "va-insta-like", "va-insta-comment", "va-insta-follow"]
---

# recipe-grow-followers — 팔로워 성장 전략

타겟 인게이지먼트를 통한 자연스러운 팔로워 성장 전략.

## 전략 개요

1. 같은 분야 인플루언서의 팔로워 탐색
2. 해당 팔로워들의 게시물에 자연스럽게 인게이지
3. 지속적이고 일관된 활동으로 노출 확대

## Steps

### 1. 타겟 사용자 분석
```bash
npx viruagent-cli get-profile --provider insta --username <influencer>
npx viruagent-cli list-posts --provider insta --username <influencer> --limit 10
```

### 2. 인플루언서 게시물 인게이지먼트
인플루언서의 최근 게시물에 좋아요 + 댓글:
- 해당 분야에 관심 있는 사용자들이 볼 수 있는 위치에 노출
- va-insta-comment 규칙에 따라 양질의 댓글 작성

### 3. 관련 사용자 팔로우
같은 분야 활발한 사용자 팔로우:
```bash
npx viruagent-cli follow --provider insta --username <user>
```

### 4. 일일 루틴 유지
recipe-daily-engagement 루틴을 매일 실행하여 일관된 활동 유지.

## 핵심 원칙

- **자연스러움**: 봇처럼 보이지 않는 자연스러운 활동 패턴
- **품질**: 양보다 질 — 의미 있는 댓글이 팔로우보다 효과적
- **일관성**: 매일 조금씩 꾸준히 > 하루에 몰아서
- **인내**: 팔로워 성장은 시간이 걸림 — 단기 수치에 집착하지 않기

## See Also

recipe-daily-engagement, recipe-engage-feed, va-insta-follow, persona-influencer-manager
