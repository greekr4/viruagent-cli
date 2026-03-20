---
name: va-insta-comment
version: 1.0.0
description: "Instagram: 게시물에 댓글을 작성합니다."
metadata:
  category: "command"
  provider: "insta"
  requires:
    bins: ["viruagent-cli"]
    cliHelp: "viruagent-cli comment --help"
---

# va-insta-comment — 댓글 작성

## 사용법

```bash
npx viruagent-cli comment --provider insta --post-id <shortcode> --text "comment text"
```

### 옵션

| 플래그 | 설명 |
|--------|------|
| `--post-id` | 게시물 shortcode |
| `--text` | 댓글 내용 |

## 댓글 목록

```bash
npx viruagent-cli list-comments --provider insta --post-id <shortcode>
```

## 댓글 작성 규칙

- 게시물 캡션과 동일한 언어로 작성
- 이미지/캡션 내용을 구체적으로 언급 — 맥락에 맞는 댓글
- 1~2문장, 이모지 1~2개
- 해시태그 금지
- "Nice post!", "Great content!" 같은 일반적 문구 금지
- 댓글마다 톤과 스타일 변경 — 패턴 반복 금지
- 릴스(영상)인 경우, 썸네일 + 캡션으로 맥락 파악

## 스마트 댓글 작성 프로세스

1. `analyze-post --provider insta --post-id <shortcode>` — 썸네일 + 캡션 확인
2. 썸네일 이미지를 시각적으로 분석하여 콘텐츠 파악
3. 맥락에 맞는 자연스러운 댓글 작성
4. `comment --provider insta --post-id <shortcode> --text "..."`

## Rate Limit

| 액션 | 딜레이 | 시간당 | 일일 |
|------|--------|--------|------|
| Comment | 5~7min | 5 | 100 |

## See Also

va-insta, va-insta-feed, va-insta-like
