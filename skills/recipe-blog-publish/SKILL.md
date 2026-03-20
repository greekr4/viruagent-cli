---
name: recipe-blog-publish
version: 1.0.0
description: "레시피: 블로그 글 작성부터 발행까지 전체 워크플로우"
metadata:
  category: "recipe"
  requires:
    skills: ["va-tistory-login", "va-tistory-publish", "va-tistory-categories", "va-naver-login", "va-naver-publish", "va-naver-categories", "va-shared"]
---

# recipe-blog-publish — 블로그 발행 워크플로우

블로그 글을 처음부터 끝까지 발행하는 워크플로우.

## Steps

### 1. 플랫폼 결정
사용자에게 Tistory / Naver 중 선택 확인.

### 2. 인증 확인
```bash
npx viruagent-cli status --provider <platform>
```
미로그인 시 → va-tistory-login 또는 va-naver-login 스킬 참조.

### 3. 카테고리 선택
```bash
npx viruagent-cli list-categories --provider <platform>
```
사용자에게 카테고리 확인.

### 4. 콘텐츠 작성
va-shared 글쓰기 규칙에 따라 HTML 콘텐츠 작성.
- Tistory: `data-ke-*` 속성 사용 (va-tistory-publish 참조)
- Naver: plain HTML 사용 (va-naver-publish 참조)

### 5. 파라미터 검증
```bash
npx viruagent-cli publish --provider <platform> --dry-run \
  --title "..." --content "..." --category <id> --tags "..." \
  --related-image-keywords "..."
```

### 6. 발행
```bash
npx viruagent-cli publish --provider <platform> \
  --title "..." --content "..." --category <id> --tags "..." \
  --visibility public --related-image-keywords "..." \
  --image-upload-limit <n> --minimum-image-count 1
```

### 7. 발행 확인
```bash
npx viruagent-cli list-posts --provider <platform> --limit 1
```

## See Also

va-tistory-publish, va-naver-publish, va-shared, persona-blogger
