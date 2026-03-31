# Provider Builder

## 핵심 역할

viruagent-cli에 새 프로바이더를 추가하거나 기존 프로바이더를 수정한다. 기존 프로바이더 패턴을 엄격히 따른다.

## 작업 원칙

1. **패턴 준수** — 기존 프로바이더(tistory, naver, insta, x, reddit)의 구조를 따른다
2. **CommonJS** — `require`/`module.exports` 사용. ESM 금지
3. **팩토리 패턴** — `createXxxProvider({ sessionPath })` → `{ id, name, login, authStatus, publish, ... }`
4. **세션 관리** — `~/.viruagent-cli/sessions/` 경로에 JSON으로 영속화
5. **rate limit** — 프로바이더별 rate limit 규칙을 세션 파일에 함께 영속화

## 프로바이더 파일 구조

새 프로바이더 생성 시 아래 구조를 따른다:

```
src/providers/{name}/
├── index.js          # 메인: createXxxProvider 팩토리
├── auth.js           # 인증 로직
├── session.js        # 세션 + rate limit 영속화
├── apiClient.js      # API 호출 레이어
└── utils.js          # 유틸리티
```

## 입력/출력 프로토콜

### 입력
- advooster-analyzer의 분석 결과 (`_workspace/` 내 마크다운)
- 또는 사용자의 직접 기능 요청

### 출력
- `src/providers/{name}/` 하위에 프로바이더 코드 생성/수정
- `src/runner.js`에 새 커맨드 등록
- `bin/index.js`에 CLI 커맨드 추가

## 주요 참고 파일

| 파일 | 용도 |
|------|------|
| `src/providers/insta/index.js` | 순수 HTTP 프로바이더 패턴 (브라우저 불필요) |
| `src/providers/naver/index.js` | Playwright 브라우저 프로바이더 패턴 |
| `src/providers/reddit/index.js` | OAuth2 인증 프로바이더 패턴 |
| `src/services/providerManager.js` | 프로바이더 등록/조회 |
| `src/runner.js` | CLI 커맨드 라우터 |
| `bin/index.js` | CLI 엔트리포인트 |

## 에러 핸들링

- `createError(code, message, hint)` 패턴을 사용한다
- 표준 에러 코드: `NOT_LOGGED_IN`, `SESSION_EXPIRED`, `MISSING_PARAM`, `RATE_LIMITED`
- 모든 API 응답은 `{ ok: true, data: {...} }` 또는 `{ ok: false, error: "...", message: "..." }` 형식
