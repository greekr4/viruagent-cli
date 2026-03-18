# Tistory Guide

Tistory 블로그 발행 가이드.

## 로그인

카카오 계정으로 로그인합니다. Playwright 브라우저가 필요합니다.

```bash
# 자동 로그인 (headless)
npx viruagent-cli login --username <kakao_id> --password <pw> --headless

# 수동 로그인 (브라우저에서 직접)
npx viruagent-cli login --manual
```

### 환경변수

```bash
export TISTORY_USERNAME=<카카오 ID>
export TISTORY_PASSWORD=<카카오 비밀번호>
```

### 2차 인증

카카오 2차 인증이 활성화되어 있으면 앱에서 인증 후 다시 실행합니다.

## 기능

| 명령어 | 설명 |
|--------|------|
| `login` | 카카오 로그인 → 세션 저장 |
| `auth-status` | 로그인 상태 확인 |
| `list-categories` | 카테고리 목록 조회 |
| `list-posts` | 최근 글 목록 |
| `get-post` | 글 상세 조회 |
| `publish` | 글 발행 (HTML) |
| `save-draft` | 임시저장 |
| `logout` | 세션 삭제 |

## 발행

```bash
npx viruagent-cli publish \
  --title "제목" \
  --content "<p>HTML 본문</p>" \
  --category 12345 \
  --tags "태그1,태그2" \
  --visibility public
```

### 이미지 자동 업로드

`--image-urls` 또는 `--related-image-keywords`로 이미지를 자동 업로드합니다.

```bash
npx viruagent-cli publish \
  --title "제목" \
  --content "<p>본문</p>" \
  --related-image-keywords "풍경,여행" \
  --image-upload-limit 2
```

## 세션 저장 위치

```
~/.viruagent-cli/sessions/tistory-session.json
```

브라우저 쿠키 기반. 세션 만료 시 자동 재로그인을 시도합니다.
