# Naver Blog Guide

Publishing guide for Naver Blog.

## Login

Authenticates via Naver account. Requires Playwright browser.

```bash
# Auto login
npx viruagent-cli login --provider naver --username <id> --password <pw>

# Manual login (browser)
npx viruagent-cli login --provider naver --manual
```
> "Login to Naver Blog" — Agent handles it automatically

### Environment Variables

```bash
export NAVER_USERNAME=<Naver ID>
export NAVER_PASSWORD=<Naver Password>
```

### Notes

- Naver has aggressive bot detection. Use `--manual` if auto login fails
- CAPTCHA or 2FA requires manual mode
- May be blocked from unfamiliar locations

## Features

| Command | Description |
|---------|-------------|
| `login` | Naver login → save session |
| `auth-status` | Check login status |
| `list-categories` | List categories |
| `list-posts` | List recent posts |
| `read-post` | Read a specific post |
| `publish` | Publish a post (HTML → SE Editor auto-conversion) |
| `logout` | Delete session |

## Publishing

```bash
npx viruagent-cli publish --provider naver \
  --title "My Post" \
  --content "<p>HTML content</p>" \
  --category 12345 \
  --tags "tag1,tag2" \
  --visibility public
```

### HTML → SE Editor Conversion

HTML content is automatically converted to Naver SE Editor components. Supports `<p>`, `<h2>`, `<img>`, `<blockquote>` and other common tags.

### Image Upload

Images are uploaded via Naver Blog's dedicated image API and inserted into the post body.

## Session Storage

```
~/.viruagent-cli/sessions/naver-session.json
```

Browser cookie-based. Authenticates via `NID_AUT` and `NID_SES` cookies.
