---
name: va-naver-cafe-join
description: "Naver: 카페 가입 (모바일 5회 캡차 면제, 이후 사용자 입력)"
metadata:
  category: "command"
  provider: "naver"
  requires:
    bins: ["viruagent-cli"]
---

# va-naver-cafe-join — 카페 가입

네이버 카페에 가입한다. 모바일 헤더 사용으로 처음 5회까지 캡차 없이 가입 가능. 캡차 발생 시 사용자에게 입력을 요청한다.

## 실행

```bash
npx viruagent-cli cafe-join --provider naver \
  --cafe-url <url_or_slug> \
  [--nickname <닉네임>] \
  [--captcha-value <텍스트>] \
  [--captcha-key <키>] \
  [--answers "답1,답2"]
```

### 파라미터

| 플래그 | 필수 | 설명 | 기본값 |
|--------|------|------|--------|
| `--cafe-url` | O | 카페 URL 또는 슬러그 | - |
| `--nickname` | - | 사용할 닉네임 | 자동 생성 |
| `--captcha-value` | - | 캡차 이미지 텍스트 (사용자 입력) | - |
| `--captcha-key` | - | 캡차 세션 키 (captcha_required 응답에서 제공) | - |
| `--answers` | - | 가입 질문 답변 (쉼표 구분) | 모두 "네" |

### 가입 유형

| applyType | 설명 |
|-----------|------|
| `join` | 바로 가입 (승인 불필요) |
| `apply` | 가입 신청 (관리자 승인 필요) |

### 캡차 처리

- 모바일 버전(`x-cafe-product: mweb`) 가입은 **처음 5회까지 캡차가 발생하지 않음**
- 캡차 발생 시: `captcha_required` 상태와 `captchaImageUrl` 반환
- 사용자가 이미지 URL을 브라우저에서 열어 텍스트를 확인
- `--captcha-value <텍스트> --captcha-key <키>`와 함께 재실행
- 틀린 경우 `captcha_invalid`와 새 이미지 URL 제공 → 반복

## 에러 처리

| 에러 | 조치 |
|------|------|
| `ALREADY_JOINED` | 이미 가입된 카페 |
| `CAPTCHA_REQUIRED` | `captchaImageUrl` 확인 후 `--captcha-value`/`--captcha-key`와 재실행 |
| `NOT_LOGGED_IN` | `login --provider naver` 먼저 실행 |

## See Also

va-naver, va-naver-cafe-id, va-naver-cafe-list
