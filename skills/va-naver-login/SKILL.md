---
name: va-naver-login
version: 1.0.0
description: "Naver: 네이버 계정 로그인 (manual 브라우저 모드 지원)"
metadata:
  category: "command"
  provider: "naver"
  requires:
    bins: ["viruagent-cli"]
    cliHelp: "viruagent-cli login --help"
---

# va-naver-login — Naver 로그인

## 인증 상태 확인

```bash
npx viruagent-cli status --provider naver
```

## 자동 로그인

```bash
npx viruagent-cli login --provider naver --username <naver_id> --password <pass>
```

## 수동 로그인 (브라우저)

```bash
npx viruagent-cli login --provider naver --manual
```

### 옵션

| 플래그 | 설명 | 기본값 |
|--------|------|--------|
| `--username` | 네이버 아이디 | - |
| `--password` | 네이버 비밀번호 | - |
| `--manual` | 수동 로그인 모드 | false |
| `--headless` | 헤드리스 모드 | false |

### 봇 감지 대응

네이버는 봇 감지가 강력합니다. 자동 로그인 실패 시 `--manual` 모드로 브라우저에서 직접 로그인하세요.

### 환경변수

`NAVER_USERNAME` / `NAVER_PASSWORD` 설정 시 자동 사용.

## 로그아웃

```bash
npx viruagent-cli logout --provider naver
```

## See Also

va-naver, va-shared
