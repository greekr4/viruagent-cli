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
│   ├── naver/                   # Naver 블로그 프로바이더 (Playwright 로그인)
│   │   ├── index.js
│   │   ├── auth.js
│   │   ├── session.js
│   │   ├── utils.js
│   │   ├── selectors.js
│   │   ├── editorConvert.js
│   │   └── imageUpload.js
│   └── insta/                   # Instagram 프로바이더 (순수 HTTP, 브라우저 불필요)
│       ├── index.js             # 메인 (18개 메서드)
│       ├── auth.js              # HTTP 로그인 (fetch 기반)
│       ├── session.js           # 세션 + rate limit 영속화 (userId별)
│       ├── apiClient.js         # Instagram API 클라이언트 + 안전 규칙
│       ├── smartComment.js      # 게시물 분석 (썸네일 base64 + 캡션)
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
│   └── insta-session.json       # Instagram 쿠키 + rate limit 카운터 (userId별)
└── providers.json               # 프로바이더 메타 정보
```

## 프로바이더별 특징

| 프로바이더 | 로그인 | 의존성 | 주요 기능 |
|-----------|--------|--------|----------|
| tistory   | Playwright 브라우저 | playwright | 블로그 글 발행, 임시저장, 이미지 업로드 |
| naver     | Playwright 브라우저 | playwright | 블로그 글 발행, 에디터 컴포넌트 변환 |
| insta     | 순수 HTTP (fetch)   | 없음       | 로그인, 프로필, 피드, 좋아요, 댓글, 팔로우, 포스팅 |

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
```

## 개발 컨벤션

- CommonJS (`require`/`module.exports`)
- Node.js 18+
- 프로바이더 패턴: `createXxxProvider({ sessionPath })` → `{ id, name, login, authStatus, publish, ... }`
- API 클라이언트 패턴: `createXxxApiClient({ sessionPath })` → 메서드 객체
- 세션 관리: `withProviderSession(fn)` 래퍼로 자동 재로그인
