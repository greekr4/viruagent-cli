
<p align="center">
  <img src="https://github.com/user-attachments/assets/76be6d06-3f0d-44e5-8152-d64b2fc68894" alt="viruagent-cli" />
</p>

<h1 align="center">viruagent-cli</h1>

<p align="center">
  <a href="https://github.com/greekr4/viruagent-cli/stargazers"><img src="https://img.shields.io/github/stars/greekr4/viruagent-cli" alt="GitHub stars"></a>
</p>
<p align="center">
  <a href="https://www.npmjs.com/package/viruagent-cli"><img src="https://img.shields.io/npm/v/viruagent-cli?color=blue" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/viruagent-cli" alt="license"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/viruagent-cli" alt="node version"></a>
</p>
<p align="center">
  <a href="README.md"><img src="https://img.shields.io/badge/English-blue" alt="English"></a>
  <a href="README.ko.md"><img src="https://img.shields.io/badge/한국어-red" alt="Korean"></a>
</p>

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

## 빠른 시작

![viru_install](https://github.com/user-attachments/assets/35efb57f-fada-44c0-8dd4-6d586ef33a7c)

아래 내용을 AI 에이전트에게 그대로 복사해서 보여주세요. (AI 에이전트 대상이므로 영어로 작성되어 있습니다)

```
You are installing viruagent-cli, a blog publishing CLI tool. Follow these steps in order.

Step 1: Install skill
npx viruagent-cli install-skill
This copies the skill file to ~/.claude/commands/viruagent.md. Confirm the file
exists before proceeding.

Step 2: Verify CLI
npx viruagent-cli --spec
If the output contains "ok": true, the CLI is ready. If it fails, check that Node.js
>= 18 is installed.

Tell the user that viruagent-cli installation is complete.
```

## 로그인

### Tistory

```bash
# 카카오 로그인 (ID/PW 필요)
npx viruagent-cli login --username <id> --password <pw> --headless
```

### Naver Blog

```bash
# 수동 로그인 (브라우저에서 직접 로그인)
npx viruagent-cli login --provider naver --manual

# 자동 로그인 (ID/PW)
npx viruagent-cli login --provider naver --username <id> --password <pw>
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

| 항목 | 상태 |
| --- | --- |
| Claude Code, Codex, Cursor 등 | 지원 |
| bash 실행 가능한 모든 AI 에이전트 | 지원 |
| Node.js | >= 18 |

## 지원 플랫폼

| 플랫폼 | 상태 |
| --- | --- |
| Tistory | 지원 |
| Naver Blog | 지원 |

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| CLI 프레임워크 | Commander.js |
| 브라우저 자동화 | Playwright (Chromium) |
| 쿠키 복호화 | macOS Keychain + AES-128-CBC / Windows DPAPI + AES-256-GCM / CDP 폴백 |
| 세션 관리 | JSON 파일 (`~/.viruagent-cli/`) |
| 이미지 검색 | DuckDuckGo, Wikimedia Commons |
| 네이버 에디터 | SE Editor 컴포넌트 모델 + RabbitWrite API |
| 출력 형식 | JSON envelope (`{ ok, data }` / `{ ok, error, hint }`) |

## Contributing

PR과 피드백을 환영합니다!

1. **버그 리포트** — [Issues](https://github.com/greekr4/viruagent-cli/issues)에 올려주세요
2. **기능 제안** — Issue에 `[Feature Request]` 태그로 제안해주세요
3. **코드 기여** — Fork → 브랜치 생성 → PR

```bash
git clone https://github.com/<your-username>/viruagent-cli.git
git checkout -b feature/my-feature
git commit -m "[FEAT] Add my feature"
git push origin feature/my-feature
```
