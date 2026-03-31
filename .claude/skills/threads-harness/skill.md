---
name: threads-harness
description: "Threads 프로바이더 구축 하네스 — 리버싱 → 구현 → 스킬 → QA 파이프라인"
---

# Threads 프로바이더 구축 하네스

Threads(threads.net) 프로바이더를 viruagent-cli에 추가하기 위한 오케스트레이션 파이프라인.

## 파이프라인

```
Phase 1: web-reverser → Threads API 역공학
Phase 2: provider-builder → 프로바이더 코드 생성
Phase 3: skill-writer → 스킬 파일 생성
Phase 4: qa-verifier → 기능 검증
Phase 5: readme-maker → 문서 업데이트
```

## Phase 1: API 리버싱 (web-reverser)

**담당**: `.claude/agents/web-reverser.md`
**대상**: `https://www.threads.net`
**목표**: 아래 기능의 내부 API를 역공학

| 기능 | 우선순위 | 비고 |
|------|---------|------|
| 로그인/인증 | P0 | Instagram 세션 재사용 가능성 확인 |
| 텍스트 글쓰기 | P0 | Thread 생성 |
| 사진 첨부 글쓰기 | P0 | 이미지 업로드 + Thread 생성 |
| 댓글 쓰기 | P0 | Thread에 답글 |
| 좋아요 | P1 | |
| 팔로우/언팔로우 | P1 | |
| 프로필 조회 | P1 | |
| 피드 조회 | P1 | |
| 검색 | P2 | |
| 글 삭제 | P2 | |

**수집 전략**:
1. 메인 페이지 + /login + /@username + /t/<postId> 에서 JS 수집
2. Threads는 Meta 제품이므로 Instagram 내부 API(GraphQL) 재사용 가능성 높음
3. `X-IG-App-ID`, `X-FB-LSD` 등 Meta 공통 헤더 확인
4. Threads API가 `i.instagram.com` 또는 `www.threads.net/api` 사용하는지 확인

**산출물**: `_workspace/threads_api_research.md`

## Phase 2: 프로바이더 구현 (provider-builder)

**담당**: `.claude/agents/provider-builder.md`
**입력**: Phase 1 산출물
**생성 파일**:

```
src/providers/threads/
├── index.js          # createThreadsProvider 팩토리
├── auth.js           # 인증 (Instagram 세션 재사용 or 독립)
├── session.js        # 세션 + rate limit 영속화
├── apiClient.js      # Threads API 클라이언트
└── utils.js          # 유틸리티
```

**필수 메서드**:
- `login()` / `authStatus()` / `logout()`
- `publish({ content, imageUrls? })` — Thread 생성
- `comment({ postId, text })` — 답글
- `like({ postId })` / `unlike({ postId })`
- `follow({ username })` / `unfollow({ username })`
- `getProfile({ username })` / `getFeed()` / `listPosts()`

**추가 작업**:
- `src/services/providerManager.js`에 threads 프로바이더 등록
- `src/runner.js`에 커맨드 라우팅 추가
- `bin/index.js`에 CLI 커맨드 추가

## Phase 3: 스킬 파일 (skill-writer)

**담당**: `.claude/agents/skill-writer.md`
**생성 파일**:

```
skills/
├── va-threads/SKILL.md           # Threads 개요
├── va-threads-publish/SKILL.md   # 글쓰기
├── va-threads-comment/SKILL.md   # 댓글
└── va-threads-engage/SKILL.md    # 좋아요/팔로우
```

## Phase 4: QA (qa-verifier)

**담당**: `.claude/agents/qa-verifier.md`
- 각 메서드 실제 테스트
- rate limit 동작 확인
- 에러 핸들링 확인

## Phase 5: 문서 (readme-maker)

**담당**: `.claude/skills/readme-maker/` 스킬
- README.md / README.ko.md 업데이트
- docs/en/guide-threads.md / docs/ko/guide-threads.md 생성
- CLAUDE.md 프로젝트 구조 업데이트

## 실행 명령

```
# Phase 1 실행
@web-reverser "https://www.threads.net API 역공학. 로그인, 글쓰기, 댓글, 사진첨부, 좋아요, 팔로우 API를 찾아서 _workspace/threads_api_research.md에 저장"

# Phase 2 실행 (Phase 1 완료 후)
@provider-builder "_workspace/threads_api_research.md 기반으로 src/providers/threads/ 프로바이더 생성"

# Phase 3~5는 Phase 2 완료 후 순차 실행
```
