---
name: va-insta-dm
version: 1.0.0
description: "Instagram: DM 보내기 및 메시지 목록 조회"
metadata:
  category: "command"
  provider: "insta"
  requires:
    bins: ["viruagent-cli"]
    cliHelp: "viruagent-cli send-dm --help"
---

# va-insta-dm — DM (Direct Message)

## DM 보내기

```bash
npx viruagent-cli send-dm --provider insta --username <username> --text "message"
```

기존 스레드가 있는 경우:

```bash
npx viruagent-cli send-dm --provider insta --thread-id <threadId> --text "message"
```

### 옵션

| 플래그 | 설명 |
|--------|------|
| `--username` | 수신자 사용자명 |
| `--thread-id` | 기존 스레드 ID |
| `--text` | 메시지 내용 |

## 메시지 목록

```bash
npx viruagent-cli list-messages --provider insta --thread-id <threadId>
```

브라우저를 통해 스레드의 메시지를 가져옵니다.

## Rate Limit

| 액션 | 딜레이 | 시간당 | 일일 |
|------|--------|--------|------|
| DM | 2~5min | 5 | 30 |

## See Also

va-insta, va-shared
