---
name: va-naver-cafe-join
description: "Naver: 카페 가입 (캡차 자동 해결, 질문 자동 답변)"
metadata:
  category: "command"
  provider: "naver"
  requires:
    bins: ["viruagent-cli"]
---

# va-naver-cafe-join — 카페 가입

네이버 카페에 가입한다. 캡차가 있으면 2Captcha API로 자동 해결한다.

## 실행

```bash
npx viruagent-cli cafe-join --provider naver \
  --cafe-url <url_or_slug> \
  [--nickname <닉네임>] \
  [--captcha-api-key <2captcha_key>] \
  [--answers "답1,답2"]
```

### 파라미터

| 플래그 | 필수 | 설명 | 기본값 |
|--------|------|------|--------|
| `--cafe-url` | O | 카페 URL 또는 슬러그 | - |
| `--nickname` | - | 사용할 닉네임 | 자동 생성 |
| `--captcha-api-key` | - | 2Captcha API 키 (캡차 자동 해결) | - |
| `--answers` | - | 가입 질문 답변 (쉼표 구분) | 모두 "네" |

### 가입 유형

| applyType | 설명 |
|-----------|------|
| `join` | 바로 가입 (승인 불필요) |
| `apply` | 가입 신청 (관리자 승인 필요) |

### 캡차 처리

- `--captcha-api-key` 미제공 시: 캡차 필요한 카페는 `captcha_required` 반환
- `--captcha-api-key` 제공 시: 2Captcha로 자동 해결 (최대 3회 재시도)

## 에러 처리

| 에러 | 조치 |
|------|------|
| `ALREADY_JOINED` | 이미 가입된 카페 |
| `CAPTCHA_REQUIRED` | `--captcha-api-key` 옵션 추가 |
| `NOT_LOGGED_IN` | `login --provider naver` 먼저 실행 |

## See Also

va-naver, va-naver-cafe-id, va-naver-cafe-list
