---
name: va-naver-cafe-list
description: "Naver: 카페 게시판(메뉴) 목록 조회"
metadata:
  category: "command"
  provider: "naver"
  requires:
    bins: ["viruagent-cli"]
---

# va-naver-cafe-list — 카페 게시판 목록

카페의 게시판(메뉴) 목록을 조회한다. 글쓰기 전에 boardId를 확인할 때 사용.

## 실행

```bash
npx viruagent-cli cafe-list --provider naver --cafe-id <id>
npx viruagent-cli cafe-list --provider naver --cafe-url <slug>
```

### 파라미터

| 플래그 | 필수 | 설명 |
|--------|------|------|
| `--cafe-id` | O* | 숫자 카페 ID |
| `--cafe-url` | O* | 카페 URL 또는 슬러그 |

*둘 중 하나 필수

### 응답에 포함되는 정보

| 필드 | 설명 |
|------|------|
| `boardId` | 게시판 메뉴 ID (cafe-write에서 사용) |
| `name` | 게시판 이름 |
| `boardType` | 게시판 유형 (L: 리스트, I: 이미지 등) |

## See Also

va-naver, va-naver-cafe-write
