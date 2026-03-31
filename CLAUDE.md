# viruagent-cli

AI 에이전트용 블로그/SNS 퍼블리싱 CLI 도구.

## 프로젝트 구조

```
src/
├── runner.js                    # CLI 명령어 라우터
├── services/
│   ├── providerManager.js       # 프로바이더 팩토리 (tistory, naver, insta)
│   ├── tistoryApiClient.js      # Tistory REST API 클라이언트
│   └── naverApiClient.js        # Naver 블로그 API 클라이언트
├── storage/
│   └── sessionStore.js          # 세션/메타 파일 관리 (~/.viruagent-cli/)
├── providers/
│   ├── tistory/                 # Tistory 프로바이더 (Playwright 로그인)
│   │   ├── index.js             # 메인 (publish, saveDraft, listPosts, etc.)
│   │   ├── auth.js              # 브라우저 로그인
│   │   ├── session.js           # 세션 관리
│   │   ├── fetchLayer.js        # HTTP 요청 레이어
│   │   ├── utils.js
│   │   ├── selectors.js
│   │   ├── browserHelpers.js
│   │   ├── imageNormalization.js
│   │   ├── imageSources.js
│   │   └── imageEnrichment.js
│   ├── naver/                   # Naver 블로그+카페 프로바이더
│   │   ├── index.js             # 메인 (블로그 + 카페 메서드)
│   │   ├── auth.js              # Playwright 로그인
│   │   ├── session.js           # 세션 관리
│   │   ├── cafeApiClient.js     # 카페 전용 HTTP API (가입, 글쓰기, 캡차)
│   │   ├── utils.js
│   │   ├── selectors.js
│   │   ├── editorConvert.js
│   │   └── imageUpload.js
│   ├── insta/                   # Instagram 프로바이더 (순수 HTTP, 브라우저 불필요)
│   │   ├── index.js             # 메인 (18개 메서드)
│   │   ├── auth.js              # HTTP 로그인 (fetch 기반)
│   │   ├── session.js           # 세션 + rate limit 영속화 (userId별)
│   │   ├── apiClient.js         # Instagram API 클라이언트 + 안전 규칙
│   │   ├── smartComment.js      # 게시물 분석 (썸네일 base64 + 캡션)
│   │   └── utils.js
│   ├── x/                       # X (Twitter) 프로바이더 (비공식 GraphQL API, 브라우저 불필요)
│   │   ├── index.js             # 메인 (16개 메서드)
│   │   ├── auth.js              # 쿠키 기반 인증 (auth_token + ct0)
│   │   ├── session.js           # 세션 + rate limit 영속화
│   │   ├── apiClient.js         # GraphQL API 클라이언트 + 안전 규칙
│   │   ├── graphqlSync.js       # main.js에서 queryId 동적 추출 + 캐싱
│   │   └── utils.js
│   ├── reddit/                  # Reddit 프로바이더 (공식 OAuth2 API, 브라우저 불필요)
│   │   ├── index.js             # 메인 (16개 메서드)
│   │   ├── auth.js              # OAuth2 password grant 인증
│   │   ├── session.js           # 세션 + token 자동 갱신 + rate limit 영속화
│   │   ├── apiClient.js         # Reddit REST API 클라이언트 + 안전 규칙
│   │   └── utils.js
│   └── threads/                 # Threads 프로바이더 (Barcelona API, 브라우저 불필요)
│       ├── index.js             # 메인 (publish, comment, like, follow, search, feed 등)
│       ├── auth.js              # Instagram Bloks API 로그인 (IGT:2 토큰)
│       ├── session.js           # 세션 + rate limit 영속화
│       ├── apiClient.js         # Barcelona API 클라이언트 + 안전 규칙
│       └── utils.js
├── bin/
│   └── index.js                 # CLI 엔트리포인트
└── skills/
    └── viruagent.md             # Claude Code 스킬 파일
```

## 세션 저장 위치

```
~/.viruagent-cli/
├── sessions/
│   ├── tistory-session.json     # Tistory 쿠키
│   ├── naver-session.json       # Naver 쿠키
│   ├── insta-session.json       # Instagram 쿠키 + rate limit 카운터 (userId별)
│   ├── x-session.json           # X (Twitter) 쿠키 (auth_token + ct0)
│   ├── reddit-session.json     # Reddit OAuth2 token + rate limit 카운터
│   └── threads-session.json   # Threads IGT:2 토큰 + rate limit 카운터
├── x-graphql-cache.json         # X GraphQL queryId 캐시 (1시간 TTL)
└── providers.json               # 프로바이더 메타 정보
```

## 프로바이더별 특징

| 프로바이더 | 로그인 | 의존성 | 주요 기능 |
|-----------|--------|--------|----------|
| tistory   | Playwright 브라우저 | playwright | 블로그 글 발행, 임시저장, 이미지 업로드 |
| naver     | Playwright 브라우저 + HTTP | playwright | 블로그 글 발행, 카페 가입(모바일 5회 캡차 면제), 카페 글쓰기 |
| insta     | 순수 HTTP (fetch)   | 없음       | 로그인, 프로필, 피드, 좋아요, 댓글, 팔로우, 포스팅 |
| x         | 쿠키 기반 (auth_token + ct0) | 없음 | 트윗 발행, 타임라인, 검색, 좋아요, 리트윗, 미디어 업로드 |
| reddit    | OAuth2 또는 쿠키 (듀얼) | 없음 | 글 작성, 댓글, 업보트, 검색, 서브레딧 구독 |
| threads   | Instagram Bloks API (IGT:2 토큰) | 없음 | 글쓰기, 답글, 좋아요, 팔로우, 이미지 업로드, 검색, 피드 |

## Instagram Rate Limit 규칙

신규 계정 (0~20일) 기준:

| 액션 | 딜레이 | 시간당 | 일일 |
|------|--------|--------|------|
| 좋아요 | 20~40초 | 15 | 500 |
| 댓글 | 300~420초 (5~7분) | 5 | 100 |
| 팔로우 | 60~120초 | 15 | 250 |
| 언팔로우 | 60~120초 | 10 | 200 |
| DM | 120~300초 | 5 | 30 |
| 게시물 | 60~120초 | 3 | 25 |

- 한도 초과 시 `hourly_limit` / `daily_limit` 에러 발생
- 카운터는 세션 파일에 userId별로 영속화
- challenge 발생 시 브라우저에서 본인 인증 필요

## X (Twitter) Rate Limit 규칙

신규 계정 (0~30일) 기준:

| 액션 | 딜레이 | 시간당 | 일일 |
|------|--------|--------|------|
| 트윗 | 120~300초 (2~5분) | 10 | 50 |
| 좋아요 | 30~60초 | 15 | 200 |
| 리트윗 | 60~120초 | 10 | 50 |
| 팔로우 | 120~180초 | 10 | 100 |
| 언팔로우 | 120~180초 | 8 | 80 |

- 트윗/답글/인용 합산 하드캡: 2,400/일 (성숙 계정)
- 226 에러 발생 시 12~48시간 쿨다운 필수
- 읽기(프로필/타임라인/검색)는 HTTP API, 쓰기(발행)는 브라우저 경유 권장 (신규 계정)
- queryId는 `~/.viruagent-cli/x-graphql-cache.json`에 캐싱 (1시간 TTL, 자동 갱신)

## 환경변수

```
# Tistory
TISTORY_USERNAME=
TISTORY_PASSWORD=

# Naver
NAVER_USERNAME=
NAVER_PASSWORD=

# Instagram
INSTA_USERNAME=
INSTA_PASSWORD=

# X (Twitter) — 브라우저에서 쿠키 추출 필요
X_AUTH_TOKEN=
X_CT0=

# Reddit — 2가지 인증 방식 지원
# 방식 1: OAuth2 (권장) — https://www.reddit.com/prefs/apps 에서 script app 생성
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
# 방식 2: 쿠키 (OAuth 없이) — username/password만으로 old.reddit.com 레거시 API 사용
# 공통
REDDIT_USERNAME=
REDDIT_PASSWORD=

# Threads — Instagram 계정 사용 (INSTA_* 환경변수도 호환)
THREADS_USERNAME=
THREADS_PASSWORD=
```

## Reddit Rate Limit 규칙

보수적 기준:

| 액션 | 딜레이 | 시간당 | 일일 |
|------|--------|--------|------|
| 글 작성 | 600~900초 (10~15분) | 2 | 10 |
| 댓글 | 120~300초 (2~5분) | 6 | 50 |
| 업보트 | 10~30초 | 30 | 500 |
| 구독 | 30~60초 | 10 | 100 |

- OAuth2 API 전체: 100 req/min
- Token 1시간 만료, 자동 갱신
- 신규/낮은 karma 계정은 서브레딧별 추가 쿨다운 있음

## Threads Rate Limit 규칙

Instagram과 유사한 보수적 기준:

| 액션 | 딜레이 | 시간당 | 일일 |
|------|--------|--------|------|
| 글쓰기 | 120~300초 (2~5분) | 5 | 25 |
| 좋아요 | 20~40초 | 15 | 500 |
| 답글 | 300~420초 (5~7분) | 5 | 100 |
| 팔로우 | 60~120초 | 15 | 250 |

- Instagram 계정 기반이므로 Instagram과 rate limit 연동 가능성 있음
- Barcelona User-Agent + Bloks API 사용
- IGT:2 토큰 인증
- 세션: `~/.viruagent-cli/sessions/threads-session.json`

## 배포

**배포는 GitHub Actions로 자동화되어 있음. 절대 `npm publish` 직접 실행 금지.**

- `main` 브랜치에 push → GitHub Actions가 자동으로 npm 배포
- 버전 bump: `npm version patch/minor/major` 후 push
- 워크플로우 파일: `.github/workflows/`

## 에이전트 하네스

| 에이전트 | 파일 | 역할 | 담당 |
|----------|------|------|------|
| web-reverser | `.claude/agents/web-reverser.md` | 대상 웹사이트 JS 번들 역공학, API/인증/데이터구조 추출 | **Threads 프로바이더 API 리서치** |
| provider-builder | `.claude/agents/provider-builder.md` | 프로바이더 코드 구현 (팩토리 패턴 준수) | 프로바이더 생성/수정 |
| skill-writer | `.claude/agents/skill-writer.md` | 스킬 파일(SKILL.md) 생성/업데이트 | 스킬 동기화 |
| qa-verifier | `.claude/agents/qa-verifier.md` | CLI 명령 테스트, 코드 구조 검증 | QA |

### 하네스 파이프라인 (새 프로바이더 추가 시)

```
web-reverser → _workspace/{provider}_api_research.md
  ↓
provider-builder → src/providers/{provider}/ + runner.js + bin/index.js
  ↓
skill-writer → skills/va-{provider}*/SKILL.md
  ↓
qa-verifier → 기능 검증
  ↓
readme-maker (스킬) → README, 가이드, CLAUDE.md 업데이트
```

### 현재 진행 중: Threads 프로바이더

- 하네스 스킬: `.claude/skills/threads-harness/skill.md`
- Phase 1: web-reverser → Threads API 역공학 (대기 중)
- Phase 2~5: 순차 실행 예정

## 개발 컨벤션

- CommonJS (`require`/`module.exports`)
- Node.js 18+
- 프로바이더 패턴: `createXxxProvider({ sessionPath })` → `{ id, name, login, authStatus, publish, ... }`
- API 클라이언트 패턴: `createXxxApiClient({ sessionPath })` → 메서드 객체
- 세션 관리: `withProviderSession(fn)` 래퍼로 자동 재로그인
