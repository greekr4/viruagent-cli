# 네이버 카페 가이드

순수 HTTP API 방식의 네이버 카페 자동화. 브라우저 불필요 (네이버 로그인 제외).

## 명령어

| 명령어 | 설명 |
|--------|------|
| `cafe-id` | 카페 URL/슬러그에서 숫자 cafeId 추출 |
| `cafe-join` | 카페 가입 (2Captcha 캡차 자동해결) |
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

네이버 카페에 가입합니다. `--captcha-api-key` 제공 시 캡차를 자동으로 해결합니다.

```bash
# 기본 가입
npx viruagent-cli cafe-join --provider naver --cafe-url inmycar

# 캡차 자동해결 포함
npx viruagent-cli cafe-join --provider naver --cafe-url inmycar \
  --captcha-api-key <2captcha_key>

# 닉네임 지정
npx viruagent-cli cafe-join --provider naver --cafe-url inmycar \
  --nickname "내닉네임" --captcha-api-key <key>
```

### 옵션

| 플래그 | 필수 | 설명 | 기본값 |
|--------|------|------|--------|
| `--cafe-url` | O | 카페 URL 또는 슬러그 | - |
| `--nickname` | - | 사용할 닉네임 | 자동 생성 |
| `--captcha-api-key` | - | 2Captcha API 키 | - |
| `--answers` | - | 가입 질문 답변 (쉼표 구분) | 모두 "네" |

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
| `CAPTCHA_REQUIRED` | `--captcha-api-key` 옵션 추가 |
| `EDITOR_INIT_FAILED` | 글쓰기 권한 없음 — 등급 확인 |
| `CAFE_WRITE_FAILED` | API 에러 — 에러 메시지 확인 |

## 전체 워크플로우

```bash
# 1. 로그인
npx viruagent-cli login --provider naver --username <아이디> --password <비밀번호>

# 2. 카페 ID 확인
npx viruagent-cli cafe-id --provider naver --cafe-url mycafe

# 3. 카페 가입
npx viruagent-cli cafe-join --provider naver --cafe-url mycafe --captcha-api-key <key>

# 4. 게시판 조회
npx viruagent-cli cafe-list --provider naver --cafe-id 12345

# 5. 글쓰기
npx viruagent-cli cafe-write --provider naver \
  --cafe-id 12345 --board-id 1 \
  --title "안녕하세요" --content "<p>가입인사입니다</p>"
```
