---
name: advooster-analyze
description: "AdVooster_Electron 프로젝트(/Users/tk/AdVooster_Electron)의 Python 코드를 분석하여 viruagent-cli에 포팅할 비즈니스 로직, API 엔드포인트, 인증 흐름, 데이터 구조를 추출한다. 'AdVooster 분석', '카페 API 분석', '카페 가입 분석', 'AdVooster에서 가져와', 'advooster', '기존 코드 분석' 등을 언급하면 이 스킬을 사용할 것."
---

# AdVooster Analyzer

AdVooster_Electron의 Python 백엔드 코드를 분석하여 viruagent-cli 프로바이더로 포팅할 수 있는 형태로 정리한다.

## 분석 대상

```
/Users/tk/AdVooster_Electron/backend/newCore/naver/
```

핵심 모듈:

| 파일 | 역할 |
|------|------|
| `cafe_api.py` | 네이버 카페 REST API 클라이언트 |
| `cafe.py` | 카페 자동화 메인 로직 |
| `cafe_join.py` | 카페 가입 자동화 |
| `cafe_join_answers.py` | 가입 질문 자동 답변 |
| `cafe_join_nicknames.py` | 가입 닉네임 생성 |
| `cafe_comment.py` | 카페 댓글 작성 |
| `cafe_monitor.py` | 카페 게시글 모니터링 |
| `login.py` | 네이버 로그인 |
| `blog.py` / `blog_post.py` | 블로그 포스팅 |
| `soundcaptcha.py` | 캡차 처리 |

## 분석 절차

1. **대상 파일 읽기** — 요청된 모듈의 Python 파일을 Read로 읽는다
2. **API 엔드포인트 추출** — HTTP 요청(requests, fetch) URL, 메서드, 헤더를 정리한다
3. **인증 흐름 파악** — 쿠키, 토큰, 세션 관리 방식을 분석한다
4. **비즈니스 로직 추출** — 핵심 함수의 입력/출력, 분기 조건, 에러 처리를 정리한다
5. **viruagent-cli 매핑** — 추출한 기능이 viruagent-cli의 어떤 커맨드/메서드에 대응하는지 매핑한다

## 출력 형식

분석 결과를 `_workspace/` 디렉토리에 마크다운으로 저장한다:

```markdown
# {모듈명} 분석 결과

## API 엔드포인트
| 메서드 | URL | 용도 | 인증 | 요청 바디 |
|--------|-----|------|------|----------|

## 핵심 함수
| 함수명 | 파라미터 | 반환값 | 역할 |
|--------|---------|--------|------|

## 인증 흐름
(순서도 형태로 기술)

## 에러 처리 패턴
(Python 예외 → viruagent-cli 에러 코드 매핑)

## Node.js 포팅 주의점
- Python 특유 패턴 (async with, context manager 등)의 Node.js 대응
- 인코딩, URL 처리 차이점
- rate limit / 딜레이 패턴
```

## 주의사항

- AdVooster 코드를 절대 수정하지 않는다
- 분석 결과는 viruagent-cli 프로젝트 내 `_workspace/`에만 저장한다
- Python 코드의 하드코딩된 값(API key, URL 등)을 결과에 그대로 노출하지 않는다 — 패턴만 기술
