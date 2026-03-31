# Naver Cafe Guide

Pure HTTP API for Naver Cafe operations. No browser required (except for initial Naver login).

## Commands

| Command | Description |
|---------|-------------|
| `cafe-id` | Extract numeric cafeId from a cafe URL or slug |
| `cafe-join` | Join a cafe (manual captcha input when required) |
| `cafe-list` | List writable boards in a cafe |
| `cafe-write` | Write a post to a cafe board |

## Prerequisites

Login to Naver first:

```bash
npx viruagent-cli login --provider naver --username <id> --password <pw>
```

## cafe-id

Extract the numeric cafe ID from a URL or slug.

```bash
npx viruagent-cli cafe-id --provider naver --cafe-url inmycar
npx viruagent-cli cafe-id --provider naver --cafe-url https://cafe.naver.com/inmycar
```

## cafe-join

Join a Naver cafe. When a captcha challenge appears, the user must read the image and provide the text manually.

> **Tip**: Mobile version (`x-cafe-product: mweb`) join **skips captcha for the first 5 attempts.** Since viruagent-cli uses mobile headers, most cafes can be joined without captcha.

```bash
# Basic join (captcha-free for first 5 joins)
npx viruagent-cli cafe-join --provider naver --cafe-url inmycar

# With custom nickname
npx viruagent-cli cafe-join --provider naver --cafe-url inmycar \
  --nickname "MyNickname"

# When captcha appears: open captchaImageUrl in browser, read text, re-run
npx viruagent-cli cafe-join --provider naver --cafe-url inmycar \
  --captcha-value "ABC123" --captcha-key <captcha_key>
```

### Options

| Flag | Required | Description | Default |
|------|----------|-------------|---------|
| `--cafe-url` | Yes | Cafe URL or slug | - |
| `--nickname` | No | Nickname to use | Auto-generated |
| `--captcha-value` | No | Captcha image text (user input) | - |
| `--captcha-key` | No | Captcha session key (from captcha_required response) | - |
| `--answers` | No | Comma-separated answers for join questions | All "yes" |

### Captcha Flow

1. Run `cafe-join` → returns `captcha_required` status if captcha is needed
2. Open `captchaImageUrl` from the response in a browser to read the text
3. Re-run with `--captcha-value <text> --captcha-key <key>`
4. If wrong, `captcha_invalid` is returned with a new image URL → repeat

### Join Types

| Type | Description |
|------|-------------|
| `join` | Instant join (no approval needed) |
| `apply` | Join request (admin approval required) |

## cafe-list

List writable boards (menus) in a cafe. Use this to find `boardId` before writing.

```bash
npx viruagent-cli cafe-list --provider naver --cafe-id 23364048
npx viruagent-cli cafe-list --provider naver --cafe-url campinglovers
```

## cafe-write

Write a post to a Naver cafe board.

```bash
# Basic post
npx viruagent-cli cafe-write --provider naver \
  --cafe-id 23364048 --board-id 6 \
  --title "Hello World" --content "<p>My first post</p>"

# With images (individual)
npx viruagent-cli cafe-write --provider naver \
  --cafe-id 23364048 --board-id 6 \
  --title "Photo Post" --content "<p>Check these photos</p>" \
  --image-urls "https://example.com/1.jpg,https://example.com/2.jpg"

# With slide layout
npx viruagent-cli cafe-write --provider naver \
  --cafe-id 23364048 --board-id 6 \
  --title "Slide Post" --content "<p>Swipe through</p>" \
  --image-urls "url1,url2,url3" --image-layout slide

# With collage layout
npx viruagent-cli cafe-write --provider naver \
  --cafe-id 23364048 --board-id 6 \
  --title "Collage Post" --content "<p>Grid layout</p>" \
  --image-urls "url1,url2,url3,url4" --image-layout collage
```

### Options

| Flag | Required | Description | Default |
|------|----------|-------------|---------|
| `--cafe-id` | Yes* | Numeric cafe ID | - |
| `--cafe-url` | Yes* | Cafe URL or slug | - |
| `--board-id` | Yes | Board menu ID (from `cafe-list`) | - |
| `--title` | Yes | Post title | - |
| `--content` | Yes* | HTML content | - |
| `--content-file` | Yes* | Path to HTML file | - |
| `--tags` | No | Comma-separated tags | - |
| `--image-urls` | No | Comma-separated image URLs | - |
| `--image-layout` | No | `default`, `slide`, or `collage` | `default` |

*One of the starred options is required.

### Image Layouts

| Layout | Description |
|--------|-------------|
| `default` | Each image as a separate component |
| `slide` | Horizontal swipe carousel (2+ images) |
| `collage` | 2-column grid layout (2+ images) |

## Error Handling

| Error | Action |
|-------|--------|
| `NOT_LOGGED_IN` | Run `login --provider naver` first |
| `CAFE_ID_NOT_FOUND` | Check cafe URL exists |
| `ALREADY_JOINED` | Already a member |
| `CAPTCHA_REQUIRED` | Open `captchaImageUrl` and re-run with `--captcha-value`/`--captcha-key` |
| `EDITOR_INIT_FAILED` | No write permission — check membership level |
| `CAFE_WRITE_FAILED` | API error — check error message |

## Typical Workflow

```bash
# 1. Login
npx viruagent-cli login --provider naver --username <id> --password <pw>

# 2. Find cafe ID
npx viruagent-cli cafe-id --provider naver --cafe-url mycafe

# 3. Join cafe (captcha-free for first 5 joins via mobile headers)
npx viruagent-cli cafe-join --provider naver --cafe-url mycafe

# 4. List boards
npx viruagent-cli cafe-list --provider naver --cafe-id 12345

# 5. Write post
npx viruagent-cli cafe-write --provider naver \
  --cafe-id 12345 --board-id 1 \
  --title "Hello" --content "<p>World</p>"
```
