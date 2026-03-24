# X (Twitter) 가이드

X 내부 GraphQL API를 활용한 자동화. 읽기는 순수 HTTP, 인증은 쿠키 기반.

## 로그인

브라우저에서 `auth_token`과 `ct0` 쿠키를 추출하세요 (개발자 도구 → Application → Cookies → x.com).

```bash
npx viruagent-cli login --provider x --auth-token <auth_token> --ct0 <ct0>
```

### 환경변수

```bash
export X_AUTH_TOKEN=<auth_token 쿠키>
export X_CT0=<ct0 쿠키>

# 환경변수 설정 후 플래그 생략 가능
npx viruagent-cli login --provider x
```

### 세션 유지 기간

`auth_token` 쿠키는 **약 1년** 유효. `ct0` (CSRF 토큰)은 자동 갱신됨.

## 기능 (16개 메서드)

### 인증
| 명령어 | 설명 |
|--------|------|
| `login` | auth_token + ct0 쿠키 설정, Viewer 쿼리로 검증 |
| `auth-status` | 로그인 상태 확인, 유저명 및 메타데이터 표시 |
| `logout` | 세션 및 프로바이더 메타 초기화 |

### 읽기
| 명령어 | 설명 |
|--------|------|
| `get-profile --username <이름>` | 유저 프로필 (팔로워, 트윗 수, 소개 등) |
| `get-feed` | 홈 타임라인 (팔로우 중인 계정의 최신 트윗) |
| `list-posts --username <이름>` | 유저 트윗 목록 |
| `read-post --post-id <id>` | 트윗 상세 (좋아요, 리트윗, 답글, 미디어) |
| `search --query <검색어>` | 트윗 검색 |

### 쓰기
| 명령어 | 설명 |
|--------|------|
| `publish --content <텍스트>` | 트윗 발행 (미디어 첨부 가능) |
| `delete --post-id <id>` | 트윗 삭제 |

### 인터랙션
| 명령어 | 설명 |
|--------|------|
| `like --post-id <id>` | 좋아요 |
| `unlike --post-id <id>` | 좋아요 취소 |
| `retweet --post-id <id>` | 리트윗 |
| `unretweet --post-id <id>` | 리트윗 취소 |
| `follow --username <이름>` | 팔로우 |
| `unfollow --username <이름>` | 언팔로우 |

### 유틸리티
| 명령어 | 설명 |
|--------|------|
| `rate-limit-status` | 현재 rate limit 카운터 표시 |
| `sync-operations` | GraphQL queryId 강제 재동기화 |

## GraphQL QueryId 동적 동기화

X는 내부 GraphQL API를 사용하며, 각 operation의 `queryId`가 **X 배포 시마다 변경**됩니다. viruagent-cli는 이를 자동으로 처리합니다:

1. `https://x.com` HTML → `main.{hash}.js` URL 추출
2. main.js 다운로드 → 모든 `queryId` / `operationName` / `featureSwitches` 매핑 파싱
3. `~/.viruagent-cli/x-graphql-cache.json`에 캐싱 (1시간 TTL)
4. API 실패 시 (queryId 만료) → 자동 재동기화 후 재시도

현재 **166개 GraphQL operation**을 추출합니다 (CreateTweet, DeleteTweet, FavoriteTweet, UserByScreenName, SearchTimeline, HomeLatestTimeline 등).

## Rate Limit 규칙

신규 계정 (0~30일) 기준:

| 액션 | 딜레이 | 시간당 | 일일 |
|------|--------|--------|------|
| 트윗 | 120~300초 (2~5분) | 10 | 50 |
| 좋아요 | 30~60초 | 15 | 200 |
| 리트윗 | 60~120초 | 10 | 50 |
| 팔로우 | 120~180초 | 10 | 100 |
| 언팔로우 | 120~180초 | 8 | 80 |

- 하드캡: 2,400 트윗/일 (답글, 인용 포함)
- **226 에러** = 자동화 감지 → 12~48시간 대기 필수
- 카운터는 세션 파일에 영속화 (CLI 재시작해도 유지)
- 모든 딜레이에 랜덤 지터 적용 (±30%)

### 226 에러 발생 원인

- 짧은 시간에 대량 액션 (버스트)
- 반복적인 동일 콘텐츠
- 읽기 없이 쓰기만 수행
- 신규 계정 + 대량 요청
- 고정 간격 패턴

## 미디어 업로드

`upload.x.com`으로 청크 업로드 지원:

```bash
npx viruagent-cli publish --provider x --content "안녕하세요" --media /path/to/image.jpg
```

## 참고사항

- **읽기** (프로필, 타임라인, 검색)는 HTTP API로 안정적 동작
- **쓰기** (트윗, 리트윗)는 신규 계정에서 226 발생 가능 → 브라우저 폴백 사용
- **좋아요/팔로우**는 신규 계정에서도 HTTP API로 정상 동작
- GraphQL queryId는 자동 갱신 — 수동 관리 불필요
