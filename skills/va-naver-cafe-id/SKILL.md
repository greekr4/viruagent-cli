---
name: va-naver-cafe-id
description: "Naver: 카페 URL에서 숫자 cafeId 추출"
metadata:
  category: "command"
  provider: "naver"
  requires:
    bins: ["viruagent-cli"]
---

# va-naver-cafe-id — 카페 ID 추출

카페 URL 또는 슬러그에서 숫자 cafeId를 추출한다.

## 실행

```bash
npx viruagent-cli cafe-id --provider naver --cafe-url <url_or_slug>
```

### 파라미터

| 플래그 | 필수 | 설명 |
|--------|------|------|
| `--cafe-url` | O | 카페 URL 또는 슬러그 (예: `inmycar` 또는 `https://cafe.naver.com/inmycar`) |

### 응답 예시

```json
{
  "ok": true,
  "data": {
    "provider": "naver",
    "cafeId": "29075207",
    "slug": "inmycar",
    "cafeUrl": "inmycar"
  }
}
```

## 에러 처리

| 에러 | 조치 |
|------|------|
| `CAFE_ID_NOT_FOUND` | 카페 URL이 존재하지 않거나 휴면 카페 |
| `NOT_LOGGED_IN` | `login --provider naver` 먼저 실행 |

## See Also

va-naver, va-naver-cafe-join
