---
name: va-naver-draft
version: 1.0.0
description: "Naver: 블로그 글 임시저장 (private 포스트로 저장)"
metadata:
  category: "command"
  provider: "naver"
  requires:
    bins: ["viruagent-cli"]
    cliHelp: "viruagent-cli save-draft --help"
---

# va-naver-draft — Naver 임시저장

## 사용법

```bash
npx viruagent-cli save-draft \
  --provider naver \
  --title "Draft Title" \
  --content "<h2>...</h2><p>...</p>" \
  --category <id> \
  --tags "tag1,tag2,tag3,tag4,tag5" \
  --related-image-keywords "keyword1,keyword2"
```

`publish` 대신 `save-draft` 사용. 옵션은 동일.

**참고**: Naver는 실제 임시저장 API가 없습니다. `save-draft`는 `--visibility private`로 비공개 글을 생성합니다.

## See Also

va-naver-publish, va-naver, va-shared
