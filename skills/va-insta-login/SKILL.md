---
name: va-insta-login
version: 1.0.0
description: "Instagram: 로그인 및 챌린지(본인 인증) 해결"
metadata:
  category: "command"
  provider: "insta"
  requires:
    bins: ["viruagent-cli"]
    cliHelp: "viruagent-cli login --help"
---

# va-insta-login — Instagram 로그인

## 인증 상태 확인

```bash
npx viruagent-cli status --provider insta
```

## 로그인

```bash
npx viruagent-cli login --provider insta --username <user> --password <pass>
```

### 옵션

| 플래그 | 설명 | 기본값 |
|--------|------|--------|
| `--username` | 인스타그램 아이디 | - |
| `--password` | 인스타그램 비밀번호 | - |

### 환경변수

`INSTA_USERNAME` / `INSTA_PASSWORD` 설정 시 자동 사용.

## 챌린지 해결

로그인 시 `challenge` 에러 (302 redirect to /challenge/) 발생 시:

```bash
npx viruagent-cli resolve-challenge --provider insta
```

브라우저에서 본인 인증이 필요할 수 있습니다.

## 에러 처리

| 에러 | 조치 |
|------|------|
| `challenge` | `resolve-challenge` 실행 또는 브라우저 인증 |
| `SESSION_EXPIRED` | `login` 재실행 |

## See Also

va-insta, va-shared
