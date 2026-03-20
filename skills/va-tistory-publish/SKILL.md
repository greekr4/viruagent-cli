---
name: va-tistory-publish
version: 1.0.0
description: "Tistory: 블로그 글 발행 (HTML 콘텐츠 + 이미지)"
metadata:
  category: "command"
  provider: "tistory"
  requires:
    bins: ["viruagent-cli"]
    cliHelp: "viruagent-cli publish --help"
---

# va-tistory-publish — Tistory 글 발행

## 사용법

```bash
npx viruagent-cli publish \
  --provider tistory \
  --title "Post Title" \
  --content "<h2>...</h2><p>...</p>" \
  --category <id> \
  --tags "tag1,tag2,tag3,tag4,tag5" \
  --visibility public \
  --related-image-keywords "keyword1,keyword2" \
  --image-upload-limit 2 \
  --minimum-image-count 1
```

### 옵션

| 플래그 | 설명 | 기본값 |
|--------|------|--------|
| `--title` | 글 제목 | (필수) |
| `--content` | HTML 콘텐츠 | - |
| `--content-file` | HTML 파일 경로 (절대) | - |
| `--category` | 카테고리 ID | - |
| `--tags` | 쉼표 구분 태그 (5개) | - |
| `--visibility` | public / private | public |
| `--related-image-keywords` | 이미지 검색 키워드 (영어) | - |
| `--image-upload-limit` | 최대 이미지 수 | 1 |
| `--minimum-image-count` | 최소 이미지 수 | 1 |
| `--dry-run` | 파라미터만 검증 | false |

## HTML 템플릿

```html
<!-- 1. Hook -->
<blockquote data-ke-style="style2">[한 문장 임팩트]</blockquote>
<p data-ke-size="size16">&nbsp;</p>

<!-- 2. 서론 (2~3단락) -->
<p data-ke-size="size18">[맥락과 공감, 3~5문장]</p>
<p data-ke-size="size18">[이 글에서 다룰 내용]</p>
<p data-ke-size="size16">&nbsp;</p>

<!-- 3. 본문 (3~4 섹션) -->
<h2>[섹션 제목]</h2>
<p data-ke-size="size18">[3~5문장, 근거 포함]</p>
<p data-ke-size="size18">[분석과 시사점]</p>
<p data-ke-size="size16">&nbsp;</p>

<!-- 4. 핵심 정리 -->
<h2>핵심 정리</h2>
<ul>
  <li>[핵심 1]</li>
  <li>[핵심 2]</li>
  <li>[핵심 3]</li>
</ul>
<p data-ke-size="size16">&nbsp;</p>

<!-- 5. 마무리 -->
<p data-ke-size="size18">[구체적 실행 제안]</p>
```

## 이미지 규칙

- `--related-image-keywords`에 영어 키워드 2~3개 항상 포함
- `--image-upload-limit 2`, `--minimum-image-count 1` 설정
- `--no-auto-upload-images`는 사용자 명시 요청 시만

## 발행 후 검증

```bash
npx viruagent-cli list-posts --provider tistory --limit 1
```

## See Also

va-tistory, va-tistory-draft, va-shared
