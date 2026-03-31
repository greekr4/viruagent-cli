# Threads Guide

Threads automation via Barcelona (Instagram Private API). Works via pure HTTP — no browser needed. Uses IGT:2 token authentication.

## Login

Threads uses your Instagram account. No separate Threads login exists.

```bash
npx viruagent-cli login --provider threads --username <instagram_id> --password <password>
```

### Environment Variables

```bash
export THREADS_USERNAME=<Instagram ID>
export THREADS_PASSWORD=<Instagram Password>

# INSTA_USERNAME / INSTA_PASSWORD also work as fallback
npx viruagent-cli login --provider threads
```

### Session Duration

The IGT:2 token is refreshed automatically. Re-login if session expires.

## Features

### Authentication

| Command | Description |
|---------|-------------|
| `login` | Bloks API login, obtain IGT:2 token |
| `auth-status` | Check session validity |
| `logout` | Clear session |

### Read Operations

| Command | Description |
|---------|-------------|
| `get-profile --username <user>` | User profile (followers, bio, etc.) |
| `get-feed` | Your Threads feed timeline |
| `search --query <text>` | Search threads |

### Write Operations

| Command | Description |
|---------|-------------|
| `publish --content <text>` | Post a thread (text only) |
| `publish --content <text> --image-urls <url>` | Post a thread with image |

### Interactions

| Command | Description |
|---------|-------------|
| `like --post-id <id>` | Like a thread |
| `comment --post-id <id> --text "..."` | Reply to a thread |
| `follow --username <user>` | Follow a user |

## Rate Limits

Similar to Instagram (new account basis):

| Action | Delay | Hourly | Daily |
|--------|-------|--------|-------|
| Post | 120-300s (2-5min) | 5 | 25 |
| Like | 20-40s | 15 | 500 |
| Reply | 300-420s (5-7min) | 5 | 100 |
| Follow | 60-120s | 15 | 250 |

### Safeguards

- **Auto-block on limit exceeded**: Throws `hourly_limit` / `daily_limit` error immediately
- **Persistent counters**: Saved per user in session file — survives process restarts
- **Auto-reset**: Counters reset after 1 hour / 24 hours
- **Random delays**: All actions use randomized delays to avoid bot detection

## CLI Usage

All commands use `--provider threads`.

```bash
# Login
npx viruagent-cli login --provider threads --username myid --password mypw

# Post a thread
npx viruagent-cli publish --provider threads --content "Hello Threads!"

# Post with image
npx viruagent-cli publish --provider threads --content "Check this out" --image-urls "https://example.com/image.jpg"

# Reply to a thread
npx viruagent-cli comment --provider threads --post-id 12345 --text "Great thread!"

# Like a thread
npx viruagent-cli like --provider threads --post-id 12345

# Follow a user
npx viruagent-cli follow --provider threads --username someone

# Search
npx viruagent-cli search --provider threads --query "AI tools"

# Profile
npx viruagent-cli get-profile --provider threads --username someone

# Feed
npx viruagent-cli get-feed --provider threads

# Rate limit status
npx viruagent-cli rate-limit-status --provider threads
```

## Session File Structure

```
~/.viruagent-cli/sessions/threads-session.json
```

```json
{
  "token": "IGT:2:...",
  "cookies": [ ... ],
  "updatedAt": "2026-03-31T...",
  "rateLimits": {
    "12345678": {
      "publish": { "hourly": 1, "daily": 3, "hourStart": ..., "dayStart": ... },
      "like": { "hourly": 5, "daily": 20, ... },
      "savedAt": "2026-03-31T..."
    }
  }
}
```

All data stored locally only. No server transmission.

## Notes

- Threads shares the Instagram account — actions may affect Instagram rate limits
- Barcelona User-Agent is required for all API calls
- IGT:2 token is the primary auth mechanism (not cookies)
- Image upload uses the Instagram media upload endpoint
