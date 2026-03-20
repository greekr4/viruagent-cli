---
name: recipe-cross-post
version: 1.0.0
description: "레시피: 블로그 발행 후 Instagram 홍보 포스팅 연계"
metadata:
  category: "recipe"
  requires:
    skills: ["va-tistory-publish", "va-naver-publish", "va-insta-comment", "va-insta-dm", "va-shared"]
---

# recipe-cross-post — 블로그 → 인스타 홍보

블로그 글 발행 후 Instagram에서 홍보하는 크로스 포스팅 워크플로우.

## Steps

### 1. 블로그 발행
recipe-blog-publish 워크플로우로 블로그 글 발행.

### 2. 인스타 인증 확인
```bash
npx viruagent-cli status --provider insta
```

### 3. 관련 게시물 찾기
```bash
npx viruagent-cli get-feed --provider insta
```
블로그 주제와 관련된 인스타 게시물 탐색.

### 4. 홍보 인게이지먼트
관련 게시물에 좋아요 + 맥락 댓글 작성.
- 블로그 링크 직접 홍보 대신, 관련 커뮤니티에 자연스럽게 참여
- va-insta-comment 댓글 규칙 준수

### 5. 결과 요약
수행한 활동 (좋아요 수, 댓글 수) 사용자에게 보고.

## See Also

recipe-blog-publish, va-insta-comment, va-insta-like, persona-sns-marketer
