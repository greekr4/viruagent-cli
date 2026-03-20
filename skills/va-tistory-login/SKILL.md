---
name: va-tistory-login
version: 1.0.0
description: "Tistory: 카카오 계정으로 로그인 (2FA 지원)"
metadata:
  category: "command"
  provider: "tistory"
  requires:
    bins: ["viruagent-cli"]
    cliHelp: "viruagent-cli login --help"
---

# va-tistory-login — Tistory 로그인

## 인증 상태 확인

```bash
npx viruagent-cli status --provider tistory
```

## 로그인

```bash
npx viruagent-cli login --provider tistory --username <kakao_id> --password <pass> --headless
```

### 옵션

| 플래그 | 설명 | 기본값 |
|--------|------|--------|
| `--username` | 카카오 아이디 | - |
| `--password` | 카카오 비밀번호 | - |
| `--headless` | 헤드리스 브라우저 모드 | false |
| `--two-factor-code` | 2FA 인증 코드 | - |

### 2FA 처리

로그인 결과가 `pending_2fa`인 경우:
1. 사용자에게 카카오 앱에서 인증 승인 요청
2. 승인 후 `status` 재확인

### 환경변수

`TISTORY_USERNAME` / `TISTORY_PASSWORD` 설정 시 자동 사용.

## 로그아웃

```bash
npx viruagent-cli logout --provider tistory
```

## See Also

va-tistory, va-shared
