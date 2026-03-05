# viruagent-cli

**AI가 블로그 글을 써주는 건 익숙하다. 근데 "발행"까지 자동으로 끝내버린다면?**

viruagent-cli는 AI 에이전트가 티스토리 블로그에 글을 쓰고, 태그를 만들고, 발행까지 자동으로 처리하는 CLI 도구입니다.

사람이 아닌 **AI 에이전트를 위해** 설계되었습니다.

## 설치

```bash
npx viruagent-cli install-skill
```

이 한 줄이면 끝입니다. npm install도, 설정 파일도, API 키도 필요 없습니다.

설치 후 AI 에이전트에게 이렇게 말하세요:

```
"티스토리에 블로그 글 써줘"
```

## 동작 방식

```
사용자: "티스토리에 AI 트렌드로 블로그 글 써줘"
  → 에이전트가 로그인 확인
  → 카테고리 조회
  → 콘텐츠 작성 + 태그 5개 생성
  → dry-run으로 검증
  → 발행 완료
```

모든 과정이 자동입니다. 사용자는 결과만 확인하면 됩니다.

## 자연어로 모든 것을 요청

| 이렇게 말하면 | 에이전트가 알아서 |
|---|---|
| "이거 설치해줘" | `npx viruagent-cli install-skill` 실행 |
| "블로그 써줘" | 로그인 → 카테고리 → 글 작성 → 태그 → 발행 |
| "임시저장해줘" | 같은 흐름, `save-draft` 사용 |
| "최근 글 보여줘" | `list-posts` 실행 |
| "카테고리 뭐 있어?" | `list-categories` 실행 |
| "사용법 알려줘" | `--spec`으로 명령어 파악 후 설명 |

## 왜 MCP가 아니라 CLI인가?

| | MCP | CLI |
|---|---|---|
| 설정 | 복잡 (서버 실행, 클라이언트 연결) | `npx` 한 줄 |
| 호환성 | 특정 클라이언트 종속 | bash 실행 가능한 모든 에이전트 |
| 확장성 | 프로토콜 제약 | 자유로운 파이프라인 |

Claude Code, Codex, 커스텀 에이전트 등 **bash만 실행할 수 있으면** 어디서든 동작합니다.

## 주요 기능

- **자동 발행** — 글 작성부터 발행까지 원스텝
- **JSON 응답** — 모든 출력이 `{ ok, data }` / `{ ok, error, hint }` 구조
- **`--spec`** — AI가 CLI 스키마를 자동 탐색
- **`--dry-run`** — 실행 없이 파라미터 검증
- **스킬 설치** — `install-skill` 한 줄로 AI 에이전트 연동
- **세션 관리** — 로그인 세션 자동 저장/갱신
- **이미지 처리** — 키워드 기반 이미지 검색 및 업로드

## 지원 플랫폼

| 플랫폼 | 상태 |
|---|---|
| Tistory | ✅ 지원 |
| Naver | 🔜 예정 |

## 명령어

| 명령어 | 설명 |
|---|---|
| `status` | 로그인 상태 확인 |
| `login` | 로그인 |
| `logout` | 로그아웃 |
| `publish` | 글 발행 |
| `save-draft` | 임시저장 |
| `list-categories` | 카테고리 목록 |
| `list-posts` | 최근 글 목록 |
| `read-post` | 글 상세 조회 |
| `list-providers` | 지원 플랫폼 목록 |
| `install-skill` | AI 스킬 설치 |

## AI 에이전트 개발자용

```bash
# CLI 전체 스키마 확인
npx viruagent-cli --spec

# 단일 명령어 스키마
npx viruagent-cli publish --spec
```

응답 형식:
```jsonc
// 성공 (exit 0)
{ "ok": true, "data": { ... } }

// 실패 (exit 1)
{ "ok": false, "error": "NOT_LOGGED_IN", "message": "...", "hint": "viruagent-cli login ..." }
```

## 요구사항

- Node.js >= 18

## License

MIT
