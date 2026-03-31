---
name: va-threads-publish
version: 1.0.0
description: "Threads 글쓰기: 텍스트/이미지 포스팅"
metadata:
  category: "publish"
  provider: "threads"
  requires:
    bins: ["viruagent-cli"]
---

# va-threads-publish — Threads 글쓰기

Threads에 텍스트/이미지를 발행하는 가이드.

## 명령어

```bash
# 텍스트만
npx viruagent-cli publish --provider threads \
  --content "<텍스트>"

# 이미지 첨부
npx viruagent-cli publish --provider threads \
  --content "<텍스트>" \
  --image-urls "<이미지URL>"
```

## 글쓰기 규칙 (Threads 최적화)

### 분량
- **최적 길이**: 100~300자 (짧고 임팩트 있게)
- Threads는 짧은 텍스트 중심 — 블로그처럼 길게 쓰지 않음

### 첫 줄이 전부다
- **숫자**: "3가지만 알면 됩니다"
- **반전**: "잘못 알고 있었습니다"
- **질문**: "이거 해보셨나요?"
- **공감**: "저만 이런 거 아니죠?"

### 해시태그
- Threads는 해시태그 효과가 Instagram보다 약함
- 최대 5개, 본문 하단에 배치
- 검색 기능이 제한적이므로 키워드를 본문에 자연스럽게 녹이기

### 이미지
- 이미지 1장 첨부 가능
- `--image-urls`에 직접 URL 지정
- 고해상도 (1080x1080 이상) 권장

## 발행 예시

```bash
# 짧은 의견
npx viruagent-cli publish --provider threads \
  --content "AI가 코드 리뷰해주는 시대.

그런데 아직도 혼자 다 보고 있다면
도구를 바꿀 때입니다."

# 이미지 포함
npx viruagent-cli publish --provider threads \
  --content "오늘의 작업 환경. 카페에서 코딩하는 게 제일 잘 됨." \
  --image-urls "https://example.com/workspace.jpg"
```

## 주의사항

- 글 최대 500자 (초과 시 잘림)
- 발행 간격: 최소 2~5분 (rate limit)
- 로그인 안 된 경우: `login --provider threads` 먼저 실행
- Instagram 계정 공유이므로 Instagram challenge 발생 가능

## See Also

va-threads, va-shared
