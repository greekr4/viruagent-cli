---
name: viruagent
version: 1.0.0
description: "viruagent-cli — 블로그/SNS 자동화 에이전트. 플랫폼 라우팅, 글쓰기 규칙, 에러 처리."
triggers:
  - viruagent
  - 블로그
  - blog
  - 인스타
  - instagram
  - 티스토리
  - 네이버
  - 좋아요
  - 댓글
  - 팔로우
metadata:
  category: "router"
  requires:
    bins: ["viruagent-cli"]
---

# viruagent — 블로그/SNS 자동화 에이전트

viruagent-cli를 사용하는 블로그/SNS 자동화 에이전트입니다.
사용자 요청에 따라 적절한 스킬 파일을 읽고 실행합니다.

## Platform Router

| 트리거 | 스킬 파일 |
|--------|-----------|
| 티스토리, tistory | `va-tistory/SKILL.md` |
| 네이버, naver | `va-naver/SKILL.md` |
| 인스타, instagram, 좋아요, 댓글, 팔로우 | `va-insta/SKILL.md` |
| 블로그 써줘 (플랫폼 미지정) | 사용자에게 플랫폼 질문 |
| 블로거 역할 | `persona-blogger/SKILL.md` |
| 인플루언서 관리 | `persona-influencer-manager/SKILL.md` |
| SNS 마케팅 | `persona-sns-marketer/SKILL.md` |

## 스킬 파일 위치

모든 하위 스킬은 viruagent-cli 패키지 내 `skills/` 디렉토리에 있습니다:

```
SKILLS_DIR: <viruagent-cli 설치 경로>/skills/
```

사용자의 요청을 분석한 뒤, 해당 스킬 파일을 Read 도구로 읽어서 지침을 따르세요.

### 단일 명령 스킬

| 스킬 | 파일 | 설명 |
|------|------|------|
| va-tistory | `va-tistory/SKILL.md` | Tistory 개요 |
| va-tistory-login | `va-tistory-login/SKILL.md` | 로그인 (2FA) |
| va-tistory-publish | `va-tistory-publish/SKILL.md` | 글 발행 |
| va-tistory-draft | `va-tistory-draft/SKILL.md` | 임시저장 |
| va-tistory-categories | `va-tistory-categories/SKILL.md` | 카테고리 조회 |
| va-tistory-posts | `va-tistory-posts/SKILL.md` | 글 목록/읽기 |
| va-naver | `va-naver/SKILL.md` | Naver 개요 |
| va-naver-login | `va-naver-login/SKILL.md` | 로그인 (manual) |
| va-naver-publish | `va-naver-publish/SKILL.md` | 글 발행 |
| va-naver-draft | `va-naver-draft/SKILL.md` | 임시저장 |
| va-naver-categories | `va-naver-categories/SKILL.md` | 카테고리 조회 |
| va-naver-posts | `va-naver-posts/SKILL.md` | 글 목록/읽기 |
| va-insta | `va-insta/SKILL.md` | Instagram 개요 + 레이트리밋 |
| va-insta-login | `va-insta-login/SKILL.md` | 로그인 + 챌린지 |
| va-insta-like | `va-insta-like/SKILL.md` | 좋아요 |
| va-insta-comment | `va-insta-comment/SKILL.md` | 댓글 |
| va-insta-follow | `va-insta-follow/SKILL.md` | 팔로우/언팔 |
| va-insta-dm | `va-insta-dm/SKILL.md` | DM |
| va-insta-feed | `va-insta-feed/SKILL.md` | 피드/프로필/분석 |

### 페르소나 스킬

| 스킬 | 파일 | 설명 |
|------|------|------|
| persona-blogger | `persona-blogger/SKILL.md` | 블로거 역할 |
| persona-influencer-manager | `persona-influencer-manager/SKILL.md` | 인플루언서 매니저 |
| persona-sns-marketer | `persona-sns-marketer/SKILL.md` | SNS 마케터 |

### 레시피 스킬

| 스킬 | 파일 | 설명 |
|------|------|------|
| recipe-blog-publish | `recipe-blog-publish/SKILL.md` | 블로그 발행 워크플로우 |
| recipe-cross-post | `recipe-cross-post/SKILL.md` | 블로그 → 인스타 홍보 |
| recipe-engage-feed | `recipe-engage-feed/SKILL.md` | 피드 인게이지먼트 |
| recipe-daily-engagement | `recipe-daily-engagement/SKILL.md` | 일일 루틴 |
| recipe-grow-followers | `recipe-grow-followers/SKILL.md` | 팔로워 성장 |

## Quick Reference

```bash
npx viruagent-cli list-providers
npx viruagent-cli --spec
npx viruagent-cli --spec <command>
```

모든 응답은 JSON: `{ "ok": true, "data": {...} }` 성공, `{ "ok": false, "error": "...", "message": "...", "hint": "..." }` 실패.

## 글쓰기 규칙 (블로그 공통)

- **제목**: 핵심 키워드 포함. 10~20자. 짧고 임팩트 있게.
- **분량**: 3000~4000자. 깊이 있게, 양 채우기 아닌 실질 내용.
- **단락**: 3~5문장씩. 1~2문장 단락 반복 금지.
- **서론**: 2~3개 단락으로 맥락과 독자 공감 형성.
- **본문 섹션**: 각 h2 섹션에 2~3개 실질 단락. 바로 목록 나열 금지.
- **목록**: 3개 이상 구체적 항목일 때만 사용.
- **근거**: 본문 섹션마다 전문가 인용, 데이터, 실제 사례 중 하나 포함.
- **관점 전환**: 독자 생각을 리프레이밍하는 포인트 최소 1곳.
- **전환**: 섹션 간 브릿지 문장으로 연결.
- **강조**: `<strong>`으로 핵심 용어 (섹션당 2~3개 max).
- **소제목**: `<h2>` 사용. `<h3>` 사용 금지.
- **톤**: 대화체이되 실질적 내용.
- **마무리**: 구체적이고 실행 가능한 제안으로 끝.
- **SEO**: 제목, 첫 단락, h2 최소 1곳에 핵심 키워드 배치.
- **태그**: 정확히 5개, 쉼표 구분, 글 언어와 일치.

## 공통 에러 처리

| 에러 | 조치 |
|------|------|
| `NOT_LOGGED_IN` / `SESSION_EXPIRED` | `login` 재실행 |
| `MISSING_CONTENT` | `--content` 또는 `--content-file` 확인 |
| `PROVIDER_NOT_FOUND` | `list-providers`로 확인 |
| `INVALID_POST_ID` | `list-posts`로 ID 확인 |

## 중요 사항

- 실제 발행 전 `--dry-run`으로 파라미터 검증
- 콘텐츠는 유효한 HTML이어야 함
- 기본 프로바이더는 `tistory`
- `--content-file`은 절대 경로 사용
