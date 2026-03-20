# viruagent-cli — AI 에이전트를 위한 블로그·SNS 자동화 CLI

AI가 bash를 실행할 수 있다면, viruagent-cli 한 줄로 블로그 발행과 SNS 자동화가 된다.

## 왜 CLI인가

GUI 자동화는 화면이 바뀌면 깨진다. 전용 SDK는 에이전트마다 다시 연동해야 한다.
**CLI는 Claude, GPT, Cursor, 직접 만든 에이전트 — 어디서든 즉시 동작한다.**
에이전트가 바뀌어도, 플랫폼이 추가되어도 기존 코드는 그대로다.

## 지원 플랫폼

| 플랫폼 | 주요 기능 |
|--------|----------|
| **Tistory** | 글 발행, 임시저장, 카테고리, 이미지 업로드 |
| **Naver Blog** | 글 발행, SE Editor, 이미지 업로드 |
| **Instagram** | 좋아요, 댓글, 팔로우, 포스팅, 피드 분석 (18개 API) |

## 동작 방식

```
사용자: "블로그 써줘"
  → AI 에이전트가 스킬 파일을 읽고
    → npx viruagent-cli publish --provider tistory --title "..." --content "..."
      → { "ok": true, "data": { "postId": 123 } }
```

모든 응답은 JSON. 에이전트가 결과를 파싱해 다음 행동을 결정한다.

## 시작하기

```bash
npx viruagent-cli install-skill   # 스킬 설치
npx viruagent-cli login --provider tistory --username <ID> --password <PW>
npx viruagent-cli publish --provider tistory --title "제목" --content "<p>내용</p>"
```

GitHub: https://github.com/greekr4/viruagent-cli
