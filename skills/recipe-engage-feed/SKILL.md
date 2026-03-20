---
name: recipe-engage-feed
version: 1.0.0
description: "레시피: 피드 순회 → 좋아요 → 댓글 인게이지먼트 루프"
metadata:
  category: "recipe"
  requires:
    skills: ["va-insta-feed", "va-insta-like", "va-insta-comment"]
---

# recipe-engage-feed — 피드 인게이지먼트

Instagram 피드를 순회하며 좋아요와 댓글로 인게이지먼트하는 워크플로우.

## Steps

### 1. 레이트리밋 확인
```bash
npx viruagent-cli rate-limit-status --provider insta
```

### 2. 피드 가져오기
```bash
npx viruagent-cli get-feed --provider insta
```

### 3. 각 게시물 처리
게시물마다 반복:

#### a. 게시물 분석
```bash
npx viruagent-cli analyze-post --provider insta --post-id <shortcode>
```
썸네일 이미지 + 캡션으로 콘텐츠 파악.

#### b. 좋아요
```bash
npx viruagent-cli like --provider insta --post-id <shortcode>
```

#### c. 대기
5~7분 랜덤 대기 (댓글 레이트리밋).

#### d. 댓글 작성
```bash
npx viruagent-cli comment --provider insta --post-id <shortcode> --text "..."
```
va-insta-comment 댓글 규칙 준수.

### 4. 다음 게시물로 반복

레이트리밋 한도에 도달하면 중단하고 사용자에게 보고.

## See Also

va-insta-feed, va-insta-like, va-insta-comment, recipe-daily-engagement
