# Tistory Guide

Publishing guide for Tistory blog.

## Login

Authenticates via Kakao account. Requires Playwright browser.

```bash
# Auto login (headless)
npx viruagent-cli login --provider tistory --username <kakao_id> --password <pw> --headless

# Manual login (browser)
npx viruagent-cli login --provider tistory --manual
```
> "Login to Tistory" — Agent handles it automatically

### Environment Variables

```bash
export TISTORY_USERNAME=<Kakao ID>
export TISTORY_PASSWORD=<Kakao Password>
```

### 2FA

If Kakao 2FA is enabled, complete authentication in the Kakao app first, then retry.

## Features

| Command | Description |
|---------|-------------|
| `login` | Kakao login → save session |
| `auth-status` | Check login status |
| `list-categories` | List categories |
| `list-posts` | List recent posts |
| `read-post` | Read a specific post |
| `publish` | Publish a post (HTML) |
| `save-draft` | Save as draft |
| `logout` | Delete session |

## Publishing

```bash
npx viruagent-cli publish --provider tistory \
  --title "My Post" \
  --content "<p>HTML content</p>" \
  --category 12345 \
  --tags "tag1,tag2" \
  --visibility public
```

### Auto Image Upload

```bash
npx viruagent-cli publish --provider tistory \
  --title "My Post" \
  --content "<p>Content</p>" \
  --related-image-keywords "landscape,travel" \
  --image-upload-limit 2
```

## Session Storage

```
~/.viruagent-cli/sessions/tistory-session.json
```

Browser cookie-based. Automatic re-login on session expiry.
