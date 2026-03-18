# Instagram Guide

Instagram 자동화 가이드. 브라우저 없이 순수 HTTP로 동작합니다.

## 로그인

Playwright가 필요 없습니다. HTTP fetch로 직접 로그인합니다.

```bash
# CLI
npx viruagent-cli login --provider insta --username <id> --password <pw>
```

### 환경변수

```bash
export INSTA_USERNAME=<Instagram ID>
export INSTA_PASSWORD=<Instagram 비밀번호>

# 환경변수 설정 시 username/password 생략 가능
npx viruagent-cli login --provider insta
```

### 2단계 인증

2FA(checkpoint)가 활성화되어 있으면 먼저 브라우저에서 수동으로 인증을 완료해야 합니다.

### 세션 유효기간

`sessionid` 쿠키의 유효기간은 **1년**입니다. 한 번 로그인하면 장기간 재로그인 불필요합니다.

## 기능 (18개 메서드)

### 인증

| 메서드 | 설명 |
|--------|------|
| `login()` | HTTP 로그인 |
| `authStatus()` | 세션 유효성 확인 |
| `logout()` | 세션 삭제 |

### 조회

| 메서드 | 설명 |
|--------|------|
| `getProfile({ username })` | 프로필 조회 (팔로워, 게시물 수, 소개 등) |
| `getFeed()` | 내 피드 타임라인 |
| `listPosts({ username, limit })` | 유저 게시물 목록 (페이지네이션 지원) |
| `getPost({ postId })` | 게시물 상세 (shortcode로 조회) |
| `analyzePost({ postId })` | 게시물 분석 (썸네일 base64 + 프로필 + 캡션) |

### 상호작용

| 메서드 | 설명 | 딜레이 |
|--------|------|--------|
| `follow({ username })` | 팔로우 | 1~2분 |
| `unfollow({ username })` | 언팔로우 | 1~2분 |
| `like({ postId })` | 게시물 좋아요 | 20~40초 |
| `unlike({ postId })` | 좋아요 취소 | 20~40초 |
| `likeComment({ commentId })` | 댓글 좋아요 | 20~40초 |
| `unlikeComment({ commentId })` | 댓글 좋아요 취소 | 20~40초 |
| `comment({ postId, text })` | 댓글 작성 | 5~7분 |

### 게시

| 메서드 | 설명 | 딜레이 |
|--------|------|--------|
| `publish({ imageUrl, caption })` | 이미지 게시물 작성 | 1~2분 |

### 유틸리티

| 메서드 | 설명 |
|--------|------|
| `rateLimitStatus()` | 현재 rate limit 사용량 확인 |

## Rate Limit 안전 규칙

신규 계정 (0~20일) 기준. 모든 상호작용 액션에 랜덤 딜레이가 자동 적용됩니다.

| 액션 | 딜레이 | 시간당 한도 | 일일 한도 |
|------|--------|------------|----------|
| 좋아요 | 20~40초 | 15 | 500 |
| 댓글 | 300~420초 (5~7분) | 5 | 100 |
| 팔로우 | 60~120초 | 15 | 250 |
| 언팔로우 | 60~120초 | 10 | 200 |
| DM | 120~300초 | 5 | 30 |
| 게시물 | 60~120초 | 3 | 25 |

### 보호 기능

- **한도 초과 자동 차단**: `hourly_limit` / `daily_limit` 에러로 즉시 중단
- **카운터 영속화**: 세션 파일에 userId별로 저장 → 프로세스 재시작해도 유지
- **자동 리셋**: 1시간/24시간 경과 시 카운터 자동 초기화
- **랜덤 딜레이**: 균일 간격은 봇으로 감지 → 모든 액션에 랜덤 간격 적용

### Challenge 발생 시

Instagram이 비정상 활동을 감지하면 `/challenge/` 리다이렉트가 발생합니다.

1. 브라우저에서 `https://www.instagram.com/challenge/` 접속
2. 본인 인증 (전화/이메일) 완료
3. 24~48시간 대기 후 재사용

## CLI 사용법

모든 명령어에 `--provider insta`를 붙입니다.

```bash
# 프로필 조회
npx viruagent-cli get-profile --provider insta --username instagram

# 피드 조회
npx viruagent-cli get-feed --provider insta

# 게시물 목록
npx viruagent-cli list-posts --provider insta --username someone --limit 20

# 좋아요
npx viruagent-cli like --provider insta --post-id ABC123

# 댓글
npx viruagent-cli comment --provider insta --post-id ABC123 --text "멋진 사진!"

# 팔로우 / 언팔로우
npx viruagent-cli follow --provider insta --username someone
npx viruagent-cli unfollow --provider insta --username someone

# 게시물 분석 (썸네일 base64 포함)
npx viruagent-cli analyze-post --provider insta --post-id ABC123

# Rate Limit 확인
npx viruagent-cli rate-limit-status --provider insta
```

## 코드 사용 예시

```javascript
const { createProviderManager } = require('viruagent-cli/src/services/providerManager');
const insta = createProviderManager().getProvider('insta');

// 프로필 조회
const profile = await insta.getProfile({ username: 'instagram' });

// 전체 좋아요 + 댓글 (딜레이 자동 적용)
const posts = await insta.listPosts({ username: 'someone', limit: 20 });
for (const post of posts.posts) {
  await insta.like({ postId: post.code });        // 자동 20~40초 대기
  await insta.comment({ postId: post.code, text: '...' }); // 자동 5~7분 대기
}

// Rate Limit 확인
const status = insta.rateLimitStatus();
```

## 세션 파일 구조

```
~/.viruagent-cli/sessions/insta-session.json
```

```json
{
  "cookies": [ ... ],
  "updatedAt": "2026-03-18T...",
  "rateLimits": {
    "42879281634": {
      "like": { "hourly": 3, "daily": 12, "hourStart": ..., "dayStart": ... },
      "comment": { "hourly": 1, "daily": 5, ... },
      "savedAt": "2026-03-18T..."
    }
  }
}
```

쿠키 + rate limit 카운터 모두 로컬에만 저장됩니다. 서버 전송 없음.
