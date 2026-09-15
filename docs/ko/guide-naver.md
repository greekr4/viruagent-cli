# Naver Blog Guide

네이버 블로그 발행 가이드.

## 로그인

네이버 계정으로 로그인합니다. Playwright 브라우저가 필요합니다.

```bash
# 자동 로그인
npx viruagent-cli login --provider naver --username <id> --password <pw>

# 수동 로그인 (브라우저에서 직접)
npx viruagent-cli login --provider naver --manual
```

### 환경변수

```bash
export NAVER_USERNAME=<네이버 ID>
export NAVER_PASSWORD=<네이버 비밀번호>
```

### 주의사항

- 네이버는 봇 감지가 민감합니다. 자동 로그인 실패 시 `--manual` 사용
- 캡차, 2단계 인증 시 수동 모드 필요
- 허용하지 않은 지역에서 접속 시 차단될 수 있음

## 기능

| 명령어 | 설명 |
|--------|------|
| `login` | 네이버 로그인 → 세션 저장 |
| `auth-status` | 로그인 상태 확인 |
| `list-categories` | 카테고리 목록 조회 |
| `list-posts` | 최근 글 목록 |
| `get-post` | 글 상세 조회 |
| `publish` | 글 발행 (HTML → SE Editor 자동 변환) |
| `logout` | 세션 삭제 |

## 발행

```bash
npx viruagent-cli publish \
  --provider naver \
  --title "제목" \
  --content "<p>HTML 본문</p>" \
  --category 12345 \
  --tags "태그1,태그2" \
  --visibility public
```

### HTML → SE Editor 변환

HTML 본문을 네이버 SE Editor 컴포넌트 모델로 자동 변환합니다. `<p>`, `<h2>`, `<img>`, `<blockquote>` 등 주요 태그를 지원합니다.

### 이미지 업로드

네이버 블로그 전용 이미지 업로드 API를 통해 이미지를 자동 업로드하고 본문에 삽입합니다.

이미지를 본문 내 정확한 위치에 넣으려면 HTML에 `VIRU_IMAGE` 마커를 사용합니다. 번호는 `--image-file`, `--image-urls` 입력 순서 기준의 1-based index입니다.

```html
<p>첫 번째 차트 설명</p>
<!-- VIRU_IMAGE:1 -->
<p>두 번째 차트 설명</p>
<!-- VIRU_IMAGE:2 -->
```

```bash
npx viruagent-cli publish \
  --provider naver \
  --title "차트 글" \
  --content-file post.html \
  --image-urls "./chart1.png,./chart2.png" \
  --image-upload-limit 2
```

마커가 없으면 기존 동작을 유지하여 업로드 이미지를 본문 앞에 배치합니다. 존재하지 않는 번호, 중복 번호, 업로드에 실패한 이미지를 가리키는 마커는 발행 전에 오류로 처리합니다.

## 세션 저장 위치

```
~/.viruagent-cli/sessions/naver-session.json
```

브라우저 쿠키 기반. `NID_AUT`, `NID_SES` 쿠키로 인증 상태를 확인합니다.
