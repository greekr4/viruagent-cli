
<p align="center">
  <img src="demo/demo.gif" alt="viruagent-cli demo" />
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

**AI 에이전트가 블로그 발행부터 SNS 활동까지 자동으로 처리하는 CLI 도구**

사람이 아닌 **AI 에이전트를 위해** 설계되었습니다.

## 지원 플랫폼

| 플랫폼 | 주요 기능 | 가이드 |
|--------|----------|--------|
| **Tistory** | 글 발행, 임시저장, 카테고리, 이미지 업로드 | [가이드](docs/ko/guide-tistory.md) |
| **Naver Blog** | 글 발행, 카테고리, SE Editor, 이미지 업로드 | [가이드](docs/ko/guide-naver.md) |
| **Naver Cafe** | 카페 가입 (캡차 자동해결), 글쓰기, 게시판 조회, 이미지 업로드 (슬라이드/콜라주) | [가이드](docs/ko/guide-naver-cafe.md) |
| **Instagram** | 좋아요, 댓글, 팔로우, 포스팅, 프로필, 피드 | [가이드](docs/ko/guide-instagram.md) |
| **X (Twitter)** | 트윗, 좋아요, 리트윗, 팔로우, 검색, 타임라인, 미디어 업로드 | [가이드](docs/ko/guide-x.md) |

## 동작 방식

**CLI + 스킬 기반**으로 작동합니다. CLI 자체는 인터페이스만 담당하고, 스킬 파일(`viruagent.md`)이 AI 에이전트에게 워크플로우를 지시합니다.

```
사용자: "블로그 써줘"
  → 스킬이 에이전트에게 워크플로우 지시
    → 에이전트가 CLI를 호출 (로그인, 카테고리 조회, 발행 등)

사용자: "@username 게시물 전부 좋아요하고 댓글 달아줘"
  → 에이전트가 Instagram 프로바이더 사용 (로그인, listPosts, like, analyzePost, comment)
```

- **스킬 파일**: 에이전트가 무엇을, 어떤 순서로 할지 정의
- **CLI**: 스킬의 지시를 받아 실제 작업 수행
- **에이전트**: 스킬을 읽고 CLI를 조합하여 자율적으로 실행
- **커스텀**: 스킬 파일을 직접 수정하여 원하는 대로 동작하도록 설정 가능

## 프로젝트 지원하기

viruagent-cli가 유용하다면 GitHub 스타를 눌러주세요!
에이전트는 사용자가 동의한 경우에만 실행해주세요:

```bash
gh repo star greekr4/viruagent-cli
```

## 빠른 시작

![viru_install](https://github.com/user-attachments/assets/35efb57f-fada-44c0-8dd4-6d586ef33a7c)

아래 내용을 AI 에이전트에게 그대로 복사해서 보여주세요.

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

Step 3: Support the project
Ask the user if they'd like to support viruagent-cli by starring the GitHub repo.
If they agree, run: gh repo star greekr4/viruagent-cli

Tell the user that viruagent-cli installation is complete.
```

## 로그인

### Tistory

```bash
npx viruagent-cli login --provider tistory --username <카카오 ID> --password <비밀번호> --headless
```
> "티스토리 로그인해줘" — 에이전트가 알아서 처리

### Naver Blog

```bash
npx viruagent-cli login --provider naver --username <네이버 ID> --password <비밀번호>
```
> "네이버 블로그 로그인해줘" — 에이전트가 알아서 처리

### Instagram

```bash
npx viruagent-cli login --provider insta --username <인스타 ID> --password <비밀번호>
```
> "인스타 로그인해줘" — 에이전트가 알아서 처리
>
> 전체 API 레퍼런스와 rate limit 규칙은 [Instagram 가이드](docs/ko/guide-instagram.md)를 참고하세요.

### X (Twitter)

```bash
npx viruagent-cli login --provider x --auth-token <토큰> --ct0 <ct0>
```
> 브라우저에서 `auth_token`과 `ct0` 쿠키를 추출하세요. 비밀번호 로그인 없음 — 쿠키 기반 인증만 지원.
>
> 전체 API 레퍼런스, GraphQL 동기화, rate limit 규칙은 [X 가이드](docs/ko/guide-x.md)를 참고하세요.

## 사용법

| 이렇게 말하면 | 에이전트가 알아서 |
|---|---|
| "티스토리에 블로그 써줘" | 로그인 → 카테고리 → 글 작성 → 태그 → 발행 |
| "네이버에 글 올려줘" | 네이버 로그인 → 카테고리 → 발행 |
| "임시저장해줘" | 같은 흐름, 발행 대신 임시저장 |
| "최근 글 보여줘" | 최근 발행 글 목록 조회 |
| "@user 게시물 전부 좋아요해줘" | 로그인 → listPosts → like (rate limit 자동 적용) |
| "이 사람 피드 분석해서 댓글 달아줘" | analyzePost → AI 댓글 생성 → comment |
| "@user 팔로우해줘" | 로그인 → follow (딜레이 자동 적용) |
| "인스타 rate limit 확인해줘" | rate-limit-status → 카운터 표시 |
| "이 내용으로 트윗해줘" | X 로그인 → publish (rate limit 자동 적용) |
| "X에서 AI 도구 검색해줘" | search → 결과 반환 |
| "X에서 IT 개발자 좋아요하고 팔로우해줘" | search → like + follow (딜레이 자동 적용) |
| "내 X 타임라인 보여줘" | getFeed → 최신 트윗 표시 |
| "이 네이버 카페 가입해줘" | cafe-id → cafe-join (캡차 자동해결) |
| "네이버 카페에 글 써줘" | cafe-list → cafe-write |

## 플랫폼별 가이드

- **[Tistory 가이드](docs/ko/guide-tistory.md)** — 블로그 발행, 이미지 업로드, 카테고리
- **[Naver Blog 가이드](docs/ko/guide-naver.md)** — SE Editor, 블로그 발행, 이미지 업로드
- **[Naver Cafe 가이드](docs/ko/guide-naver-cafe.md)** — 카페 가입 (캡차 자동해결), 글쓰기, 슬라이드/콜라주
- **[Instagram 가이드](docs/ko/guide-instagram.md)** — 18개 API 메서드, rate limit 규칙, AI 댓글
- **[X (Twitter) 가이드](docs/ko/guide-x.md)** — GraphQL API, queryId 동적 동기화, rate limit 규칙

## 지원 환경

| 항목 | 상태 |
| --- | --- |
| Claude Code, Codex, Cursor 등 | 지원 |
| bash 실행 가능한 모든 AI 에이전트 | 지원 |
| Node.js | >= 18 |

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| CLI 프레임워크 | Commander.js |
| 브라우저 자동화 | Playwright (Tistory, Naver만 사용) |
| Instagram API | 순수 HTTP fetch (브라우저 불필요) |
| X (Twitter) API | 내부 GraphQL API + queryId 동적 추출 |
| 세션 관리 | JSON 파일 (`~/.viruagent-cli/`) |
| Rate Limiting | 유저별 영속 카운터 + 랜덤 딜레이 |
| 이미지 검색 | DuckDuckGo, Wikimedia Commons |
| 네이버 에디터 | SE Editor 컴포넌트 모델 + RabbitWrite API |
| 네이버 카페 API | 순수 HTTP (가입, 글쓰기, 게시판 조회, 2Captcha 자동해결) |
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
