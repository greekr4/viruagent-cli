# 네이버 카페 가이드

순수 HTTP API 방식의 네이버 카페 자동화. 브라우저 불필요 (네이버 로그인 제외).

## 명령어

| 명령어 | 설명 |
|--------|------|
| `cafe-id` | 카페 URL/슬러그에서 숫자 cafeId 추출 |
| `cafe-join` | 카페 가입 (캡차 발생 시 사용자 입력) |
| `cafe-list` | 카페 게시판(메뉴) 목록 조회 |
| `cafe-write` | 카페 게시판에 글쓰기 |

## 사전 준비

네이버 로그인이 필요합니다:

```bash
npx viruagent-cli login --provider naver --username <아이디> --password <비밀번호>
```

## cafe-id

카페 URL 또는 슬러그에서 숫자 ID를 추출합니다.

```bash
npx viruagent-cli cafe-id --provider naver --cafe-url inmycar
npx viruagent-cli cafe-id --provider naver --cafe-url https://cafe.naver.com/inmycar
```

## cafe-join

네이버 카페에 가입합니다. 캡차가 발생하면 사용자가 직접 이미지를 확인하고 값을 입력합니다.

> **팁**: 모바일 버전(`x-cafe-product: mweb`) 가입은 **처음 5회까지 캡차가 발생하지 않습니다.** viruagent-cli는 모바일 헤더를 사용하므로, 대부분의 카페에 캡차 없이 가입할 수 있습니다.

```bash
# 기본 가입 (캡차 없이 5회까지 가능)
npx viruagent-cli cafe-join --provider naver --cafe-url inmycar

# 닉네임 지정
npx viruagent-cli cafe-join --provider naver --cafe-url inmycar \
  --nickname "내닉네임"

# 캡차 발생 시: captchaImageUrl을 브라우저에서 열고 텍스트를 확인한 뒤 재실행
npx viruagent-cli cafe-join --provider naver --cafe-url inmycar \
  --captcha-value "ABC123" --captcha-key <captcha_key>
```

### 옵션

| 플래그 | 필수 | 설명 | 기본값 |
|--------|------|------|--------|
| `--cafe-url` | O | 카페 URL 또는 슬러그 | - |
| `--nickname` | - | 사용할 닉네임 | 자동 생성 |
| `--captcha-value` | - | 캡차 이미지의 텍스트 (사용자 입력) | - |
| `--captcha-key` | - | 캡차 세션 키 (captcha_required 응답에서 제공) | - |
| `--answers` | - | 가입 질문 답변 (쉼표 구분) | 모두 "네" |

### 캡차 처리 흐름

1. `cafe-join` 실행 → 캡차 필요 시 `captcha_required` 상태 반환
2. 응답의 `captchaImageUrl`을 브라우저에서 열어 텍스트 확인
3. `--captcha-value <텍스트> --captcha-key <키>`와 함께 재실행
4. 틀렸을 경우 `captcha_invalid`와 함께 새 이미지 URL 제공 → 반복

### 가입 유형

| 유형 | 설명 |
|------|------|
| `join` | 바로 가입 (승인 불필요) |
| `apply` | 가입 신청 (관리자 승인 필요) |

## cafe-list

카페의 글쓰기 가능한 게시판 목록을 조회합니다. 글쓰기 전에 `boardId`를 확인할 때 사용합니다.

```bash
npx viruagent-cli cafe-list --provider naver --cafe-id 23364048
npx viruagent-cli cafe-list --provider naver --cafe-url campinglovers
```

## cafe-write

카페 게시판에 글을 작성합니다.

```bash
# 기본 글쓰기
npx viruagent-cli cafe-write --provider naver \
  --cafe-id 23364048 --board-id 6 \
  --title "안녕하세요" --content "<p>가입인사 드립니다</p>"

# 이미지 포함 (개별)
npx viruagent-cli cafe-write --provider naver \
  --cafe-id 23364048 --board-id 6 \
  --title "사진 글" --content "<p>사진입니다</p>" \
  --image-urls "https://example.com/1.jpg,https://example.com/2.jpg"

# 슬라이드 레이아웃
npx viruagent-cli cafe-write --provider naver \
  --cafe-id 23364048 --board-id 6 \
  --title "슬라이드 글" --content "<p>넘겨보세요</p>" \
  --image-urls "url1,url2,url3" --image-layout slide

# 콜라주 레이아웃
npx viruagent-cli cafe-write --provider naver \
  --cafe-id 23364048 --board-id 6 \
  --title "콜라주 글" --content "<p>격자 배치</p>" \
  --image-urls "url1,url2,url3,url4" --image-layout collage
```

### 옵션

| 플래그 | 필수 | 설명 | 기본값 |
|--------|------|------|--------|
| `--cafe-id` | O* | 숫자 카페 ID | - |
| `--cafe-url` | O* | 카페 URL 또는 슬러그 | - |
| `--board-id` | O | 게시판 메뉴 ID (`cafe-list`로 확인) | - |
| `--title` | O | 글 제목 | - |
| `--content` | O* | HTML 콘텐츠 | - |
| `--content-file` | O* | HTML 파일 경로 | - |
| `--tags` | - | 쉼표 구분 태그 | - |
| `--image-urls` | - | 쉼표 구분 이미지 URL | - |
| `--image-layout` | - | `default`, `slide`, `collage` | `default` |

*표시 항목은 둘 중 하나 필수

### 이미지 레이아웃

| 레이아웃 | 설명 |
|---------|------|
| `default` | 이미지를 개별 컴포넌트로 삽입 |
| `slide` | 가로 스와이프 슬라이드 (2장 이상) |
| `collage` | 2열 격자 콜라주 (2장 이상) |

## 에러 처리

| 에러 | 조치 |
|------|------|
| `NOT_LOGGED_IN` | `login --provider naver` 먼저 실행 |
| `CAFE_ID_NOT_FOUND` | 카페 URL 확인 |
| `ALREADY_JOINED` | 이미 가입된 카페 |
| `CAPTCHA_REQUIRED` | `captchaImageUrl`을 확인하고 `--captcha-value`/`--captcha-key`와 함께 재실행 |
| `EDITOR_INIT_FAILED` | 글쓰기 권한 없음 — 등급 확인 |
| `CAFE_WRITE_FAILED` | API 에러 — 에러 메시지 확인 |

## 전체 워크플로우

```bash
# 1. 로그인
npx viruagent-cli login --provider naver --username <아이디> --password <비밀번호>

# 2. 카페 ID 확인
npx viruagent-cli cafe-id --provider naver --cafe-url mycafe

# 3. 카페 가입 (모바일 헤더로 5회까지 캡차 없음)
npx viruagent-cli cafe-join --provider naver --cafe-url mycafe

# 4. 게시판 조회
npx viruagent-cli cafe-list --provider naver --cafe-id 12345

# 5. 글쓰기
npx viruagent-cli cafe-write --provider naver \
  --cafe-id 12345 --board-id 1 \
  --title "안녕하세요" --content "<p>가입인사입니다</p>"
```
