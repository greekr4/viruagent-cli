---
name: va-naver-cafe-write
description: "Naver: 카페 글쓰기 (이미지 업로드, 슬라이드/콜라주 지원)"
metadata:
  category: "command"
  provider: "naver"
  requires:
    bins: ["viruagent-cli"]
---

# va-naver-cafe-write — 카페 글쓰기

네이버 카페 게시판에 글을 작성한다. 순수 HTTP API 방식 (브라우저 불필요).

## 실행

```bash
npx viruagent-cli cafe-write --provider naver \
  --cafe-id <id> --board-id <id> \
  --title "제목" \
  --content "<p>HTML 본문</p>" \
  [--tags "태그1,태그2"] \
  [--image-urls "url1,url2,url3"] \
  [--image-layout slide|collage|default]
```

### 파라미터

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
| `--image-file` | - | 로컬 이미지 파일 경로 (JPEG/PNG) | - |
| `--image-layout` | - | 이미지 레이아웃 (default/slide/collage) | default |

*표시 항목은 둘 중 하나 필수

### 이미지 레이아웃

| 레이아웃 | 설명 |
|---------|------|
| `default` | 이미지를 개별 컴포넌트로 본문에 삽입 |
| `slide` | 가로 스와이프 슬라이드 (2장 이상 필요) |
| `collage` | 2열 격자 콜라주 (2장 이상 필요) |

### 글쓰기 흐름

1. 에디터 초기화 (토큰 획득)
2. HTML → SE3 에디터 컴포넌트 변환 (네이버 upconvert API)
3. 이미지 업로드 (PhotoInfra 세션키 → 업로드 → 컴포넌트 생성)
4. contentJson 빌드
5. 글 등록 POST

## 에러 처리

| 에러 | 조치 |
|------|------|
| `EDITOR_INIT_FAILED` | 게시판 글쓰기 권한 없음 → 등급 확인 |
| `CAFE_WRITE_FAILED` | API 에러 → 에러 메시지 확인 |
| `MISSING_PARAM` | 필수 파라미터 누락 |

## 예시

```bash
# 기본 글쓰기
npx viruagent-cli cafe-write --provider naver \
  --cafe-id 23364048 --board-id 6 \
  --title "안녕하세요" --content "<p>가입인사 드립니다</p>"

# 로컬 이미지 첨부
npx viruagent-cli cafe-write --provider naver \
  --cafe-id 23364048 --board-id 6 \
  --title "오늘 사진" --content "<p>직접 찍은 사진입니다</p>" \
  --image-file /path/to/photo.jpg

# 이미지 슬라이드 포함
npx viruagent-cli cafe-write --provider naver \
  --cafe-id 23364048 --board-id 6 \
  --title "캠핑 후기" --content "<p>주말 캠핑 다녀왔습니다</p>" \
  --image-urls "https://img1.jpg,https://img2.jpg,https://img3.jpg" \
  --image-layout slide
```

## See Also

va-naver, va-naver-cafe-list, va-naver-cafe-join
