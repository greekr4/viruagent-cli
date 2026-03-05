# viruagent-cli

**AI 에이전트가 블로그를 쓰고, 태그를 만들고, 발행까지 자동으로 처리하는 CLI 도구**

사람이 아닌 **AI 에이전트를 위해** 설계되었습니다.

## 동작 방식

**CLI + 스킬 기반**으로 작동합니다. CLI 자체는 인터페이스만 담당하고, CLI 호출 흐름, 글 양식 등 스킬 파일(`viruagent.md`)이 AI 에이전트에게 지시합니다.

```
사용자: "블로그 써줘"
  → 스킬이 에이전트에게 워크플로우 지시
    → 에이전트가 CLI를 호출 (로그인, 카테고리 조회, 발행 등)

사용자: /viruagent "글 써줘"
  → 스킬 직접 호출
```

- **스킬 파일**: 에이전트가 무엇을, 어떤 순서로 할지 정의 (글 구조, 태그 규칙, 이미지 설정 등)
- **CLI**: 스킬의 지시를 받아 실제 작업 수행 (로그인, API 호출, 브라우저 자동화)
- **에이전트**: 스킬을 읽고 CLI를 조합하여 자율적으로 실행
- **커스텀**: 스킬 파일을 직접 수정하여 원하는 대로 동작하도록 설정 가능

## 설치

아래 내용을 AI 에이전트에게 그대로 복사해서 보여주세요.

```
You are installing viruagent-cli, a blog publishing CLI tool. Follow these steps in order.

Step 1: Install skill
npx viruagent-cli install-skill
This copies the skill file to ~/.claude/commands/viruagent.md. Confirm the file exists before proceeding.

Step 2: Verify CLI
npx viruagent-cli --spec
If the output contains "ok": true, the CLI is ready. If it fails, check that Node.js >= 18 is installed.

Step 3: Login
npx viruagent-cli status --provider tistory
If loggedIn is false, ask the user for their Tistory email and password, then run:
npx viruagent-cli login --provider tistory --username "<email>" --password "<password>" --headless
If the response contains pending_2fa, tell the user to approve the login on their mobile Kakao app, then re-run the status command to confirm.

Tell the user installation is complete. They can now say "블로그 써줘" to start writing.
```

## 사용법

| 이렇게 말하면 | 에이전트가 알아서 |
|---|---|
| "블로그 써줘" | 로그인 → 카테고리 → 글 작성 → 태그 → 발행 |
| "임시저장해줘" | 같은 흐름, 발행 대신 임시저장 |
| "최근 글 보여줘" | 최근 발행 글 목록 조회 |
| "카테고리 뭐 있어?" | 카테고리 목록 조회 |

자세한 사용법이나 커스터마이징은 에이전트에게 물어보면 안내해줍니다.

## 지원 환경

| 항목                              | 상태  |
| --------------------------------- | ----- |
| Claude Code,Codex,Cursor 등       | 지원  |
| bash 실행 가능한 모든 AI 에이전트 | 지원  |
| Node.js                           | >= 18 |

## 지원 플랫폼

| 플랫폼     | 상태 |
| ---------- | ---- |
| Tistory    | 지원 |
| Naver Blog | 예정 |

## 기술 스택

| 영역            | 기술                            | 설명                                              |
| --------------- | ------------------------------- | ------------------------------------------------- |
| CLI 프레임워크  | Commander.js                    | 명령어 정의, 옵션 파싱, `--spec` 스키마 자동 생성 |
| 브라우저 자동화 | Playwright (Chromium)           | 로그인                                            |
| 세션 관리       | JSON 파일 (`~/.viruagent-cli/`) | 쿠키 기반 세션 저장/복원                          |
| 이미지 검색     | DuckDuckGo , Wikimedia, Commons | 키워드 기반 이미지 자동 검색                      |
| 출력 형식       | JSON envelope                   | `{ ok, data }` / `{ ok, error, hint }`            |

## Contributing

PR과 피드백을 환영합니다!

### 참여 방법

1. **버그 리포트** — [Issues](https://github.com/greekr4/viruagent-cli/issues)에 올려주세요
2. **기능 제안** — Issue에 `[Feature Request]` 태그로 제안해주세요
3. **코드 기여** — Fork → 브랜치 생성 → PR

### PR 가이드

```bash
# 1. Fork 후 클론
git clone https://github.com/<your-username>/viruagent-cli.git

# 2. 브랜치 생성
git checkout -b feature/my-feature

# 3. 작업 후 커밋
git commit -m "[FEAT] Add my feature"

# 4. PR 생성
git push origin feature/my-feature
```

### 기여

- 새로운 블로그 플랫폼 프로바이더 (Naver, WordPress 등)
- 스킬 파일 템플릿 추가 (다른 AI 에이전트용)
- 이미지 소스 확장
- 테스트 코드 추가

## License

MIT
