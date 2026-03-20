---
name: va-insta-feed
version: 1.0.0
description: "Instagram: 피드, 프로필, 게시물 목록, 게시물 분석"
metadata:
  category: "command"
  provider: "insta"
  requires:
    bins: ["viruagent-cli"]
    cliHelp: "viruagent-cli get-feed --help"
---

# va-insta-feed — 피드 & 프로필 & 분석

## 피드 타임라인

```bash
npx viruagent-cli get-feed --provider insta
```

## 프로필 조회

```bash
npx viruagent-cli get-profile --provider insta --username <username>
```

## 게시물 목록

```bash
npx viruagent-cli list-posts --provider insta --username <username> --limit 20
```

| 플래그 | 설명 | 기본값 |
|--------|------|--------|
| `--username` | 대상 사용자명 | (필수) |
| `--limit` | 조회할 게시물 수 | 20 |

## 게시물 분석

```bash
npx viruagent-cli analyze-post --provider insta --post-id <shortcode>
```

반환값:
- 캡션 텍스트
- 썸네일 이미지 (base64)
- 프로필 정보

`analyze-post`를 사용해 썸네일 이미지를 시각적으로 분석하고 맥락에 맞는 댓글을 작성할 수 있습니다.

## 게시물 발행

```bash
npx viruagent-cli publish --provider insta \
  --content "캡션 텍스트 #해시태그" \
  --related-image-keywords "keyword1,keyword2" \
  --image-upload-limit 1 \
  --minimum-image-count 1
```

| 플래그 | 설명 |
|--------|------|
| `--content` | 캡션 텍스트 (해시태그 포함 가능) |
| `--image-urls` | 직접 이미지 URL 지정 |
| `--related-image-keywords` | 이미지 자동 검색 키워드 (영어 권장) |

이미지 우선순위: `--image-urls` > `--related-image-keywords` 자동 검색.
`--content`는 인스타 캡션으로 사용됩니다 (HTML 불필요).

## See Also

va-insta, va-insta-comment, va-insta-like
