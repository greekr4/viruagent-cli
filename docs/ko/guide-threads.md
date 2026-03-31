# Threads 가이드

Barcelona (Instagram Private API)를 사용한 Threads 자동화 가이드. 브라우저 없이 순수 HTTP로 동작합니다. IGT:2 토큰 인증 방식.

## 로그인

Threads는 Instagram 계정을 사용합니다. 별도 계정이 없습니다.

```bash
npx viruagent-cli login --provider threads --username <인스타 ID> --password <비밀번호>
```

### 환경변수

```bash
export THREADS_USERNAME=<Instagram ID>
export THREADS_PASSWORD=<Instagram 비밀번호>

# INSTA_USERNAME / INSTA_PASSWORD도 호환됩니다
npx viruagent-cli login --provider threads
```

### 세션 유효기간

IGT:2 토큰은 자동 갱신됩니다. 세션 만료 시 재로그인 필요.

## 기능

### 인증

| 메서드 | 설명 |
|--------|------|
| `login` | Bloks API 로그인, IGT:2 토큰 발급 |
| `auth-status` | 세션 유효성 확인 |
| `logout` | 세션 삭제 |

### 조회

| 메서드 | 설명 |
|--------|------|
| `get-profile --username <user>` | 프로필 조회 (팔로워, 소개 등) |
| `get-feed` | 내 Threads 피드 타임라인 |
| `search --query <text>` | 쓰레드 검색 |

### 글쓰기

| 메서드 | 설명 |
|--------|------|
| `publish --content <text>` | 쓰레드 작성 (텍스트만) |
| `publish --content <text> --image-urls <url>` | 이미지 첨부 쓰레드 작성 |

### 상호작용

| 메서드 | 설명 |
|--------|------|
| `like --post-id <id>` | 좋아요 |
| `comment --post-id <id> --text "..."` | 답글 |
| `follow --username <user>` | 팔로우 |

## Rate Limit 안전 규칙

Instagram과 유사한 보수적 기준. 모든 액션에 랜덤 딜레이가 자동 적용됩니다.

| 액션 | 딜레이 | 시간당 한도 | 일일 한도 |
|------|--------|------------|----------|
| 글쓰기 | 120~300초 (2~5분) | 5 | 25 |
| 좋아요 | 20~40초 | 15 | 500 |
| 답글 | 300~420초 (5~7분) | 5 | 100 |
| 팔로우 | 60~120초 | 15 | 250 |

### 보호 기능

- **한도 초과 자동 차단**: `hourly_limit` / `daily_limit` 에러로 즉시 중단
- **카운터 영속화**: 세션 파일에 유저별로 저장 → 프로세스 재시작해도 유지
- **자동 리셋**: 1시간/24시간 경과 시 카운터 자동 초기화
- **랜덤 딜레이**: 균일 간격은 봇으로 감지 → 모든 액션에 랜덤 간격 적용

## CLI 사용법

모든 명령어에 `--provider threads`를 붙입니다.

```bash
# 로그인
npx viruagent-cli login --provider threads --username myid --password mypw

# 글쓰기
npx viruagent-cli publish --provider threads --content "안녕 Threads!"

# 이미지 첨부 글쓰기
npx viruagent-cli publish --provider threads --content "이것 좀 봐" --image-urls "https://example.com/image.jpg"

# 답글
npx viruagent-cli comment --provider threads --post-id 12345 --text "좋은 글이네요!"

# 좋아요
npx viruagent-cli like --provider threads --post-id 12345

# 팔로우
npx viruagent-cli follow --provider threads --username someone

# 검색
npx viruagent-cli search --provider threads --query "AI 도구"

# 프로필 조회
npx viruagent-cli get-profile --provider threads --username someone

# 피드 조회
npx viruagent-cli get-feed --provider threads

# Rate Limit 확인
npx viruagent-cli rate-limit-status --provider threads
```

## 세션 파일 구조

```
~/.viruagent-cli/sessions/threads-session.json
```

```json
{
  "token": "IGT:2:...",
  "cookies": [ ... ],
  "updatedAt": "2026-03-31T...",
  "rateLimits": {
    "12345678": {
      "publish": { "hourly": 1, "daily": 3, "hourStart": ..., "dayStart": ... },
      "like": { "hourly": 5, "daily": 20, ... },
      "savedAt": "2026-03-31T..."
    }
  }
}
```

쿠키 + rate limit 카운터 모두 로컬에만 저장됩니다. 서버 전송 없음.

## 참고사항

- Threads는 Instagram 계정을 공유 — 액션이 Instagram rate limit에 영향을 줄 수 있음
- 모든 API 호출에 Barcelona User-Agent 필수
- IGT:2 토큰이 주요 인증 수단 (쿠키가 아님)
- 이미지 업로드는 Instagram 미디어 업로드 엔드포인트 사용
