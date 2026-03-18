# Instagram Guide

Instagram automation guide. Works via pure HTTP — no browser needed.

## Login

```bash
npx viruagent-cli login --provider insta --username <id> --password <pw>
```
> "Login to Instagram" — Agent handles it automatically

### Environment Variables

```bash
export INSTA_USERNAME=<Instagram ID>
export INSTA_PASSWORD=<Instagram Password>

# With env vars set, username/password can be omitted
npx viruagent-cli login --provider insta
```

### 2FA

If 2FA (checkpoint) is enabled, complete verification in a browser first.

### Session Duration

The `sessionid` cookie is valid for **1 year**. No need to re-login frequently.

## Features (18 Methods)

### Auth

| Method | Description |
|--------|-------------|
| `login` | HTTP login |
| `auth-status` | Check session validity |
| `logout` | Delete session |

### Read

| Method | Description |
|--------|-------------|
| `get-profile --username <user>` | Profile info (followers, posts, bio, etc.) |
| `get-feed` | Your feed timeline |
| `list-posts --username <user> --limit 20` | User's posts (with pagination) |
| `read-post --post-id <shortcode>` | Post detail |
| `analyze-post --post-id <shortcode>` | Post analysis (thumbnail base64 + profile + caption) |

### Engage

| Method | Description | Delay |
|--------|-------------|-------|
| `follow --username <user>` | Follow | 1~2 min |
| `unfollow --username <user>` | Unfollow | 1~2 min |
| `like --post-id <shortcode>` | Like a post | 20~40s |
| `unlike --post-id <shortcode>` | Unlike a post | 20~40s |
| `like-comment --comment-id <id>` | Like a comment | 20~40s |
| `unlike-comment --comment-id <id>` | Unlike a comment | 20~40s |
| `comment --post-id <shortcode> --text "..."` | Post a comment | 5~7 min |

### Publish

| Method | Description | Delay |
|--------|-------------|-------|
| `publish` | Create an image post | 1~2 min |

### Utility

| Method | Description |
|--------|-------------|
| `rate-limit-status` | Check current rate limit usage |

## Rate Limit Safety Rules

Based on new account (0~20 days) limits. Random delays are applied automatically to all engagement actions.

| Action | Delay | Hourly Limit | Daily Limit |
|--------|-------|-------------|------------|
| Like | 20~40s | 15 | 500 |
| Comment | 300~420s (5~7 min) | 5 | 100 |
| Follow | 60~120s | 15 | 250 |
| Unfollow | 60~120s | 10 | 200 |
| DM | 120~300s | 5 | 30 |
| Publish | 60~120s | 3 | 25 |

### Safeguards

- **Auto-block on limit exceeded**: Throws `hourly_limit` / `daily_limit` error immediately
- **Persistent counters**: Saved per userId in session file — survives process restarts
- **Auto-reset**: Counters reset after 1 hour / 24 hours
- **Random delays**: Uniform intervals trigger bot detection — all actions use randomized delays

### On Challenge

When Instagram detects abnormal activity, it redirects to `/challenge/`.

1. Open `https://www.instagram.com/challenge/` in a browser
2. Complete identity verification (phone/email)
3. Wait 24~48 hours before resuming

## CLI Usage

All commands use `--provider insta`.

```bash
# Profile
npx viruagent-cli get-profile --provider insta --username instagram

# Feed
npx viruagent-cli get-feed --provider insta

# Posts
npx viruagent-cli list-posts --provider insta --username someone --limit 20

# Like
npx viruagent-cli like --provider insta --post-id ABC123

# Comment
npx viruagent-cli comment --provider insta --post-id ABC123 --text "Great shot!"

# Follow / Unfollow
npx viruagent-cli follow --provider insta --username someone
npx viruagent-cli unfollow --provider insta --username someone

# Analyze post (includes thumbnail base64)
npx viruagent-cli analyze-post --provider insta --post-id ABC123

# Rate limit
npx viruagent-cli rate-limit-status --provider insta
```

## Code Usage

```javascript
const { createProviderManager } = require('viruagent-cli/src/services/providerManager');
const insta = createProviderManager().getProvider('insta');

// Profile
const profile = await insta.getProfile({ username: 'instagram' });

// Like + comment all posts (delays applied automatically)
const posts = await insta.listPosts({ username: 'someone', limit: 20 });
for (const post of posts.posts) {
  await insta.like({ postId: post.code });        // auto 20~40s delay
  await insta.comment({ postId: post.code, text: '...' }); // auto 5~7min delay
}

// Check rate limits
const status = insta.rateLimitStatus();
```

## Session File Structure

```
~/.viruagent-cli/sessions/insta-session.json
```

```json
{
  "cookies": [ ... ],
  "updatedAt": "2026-03-18T...",
  "rateLimits": {
    "42879281634": {
      "like": { "hourly": 3, "daily": 12, "hourStart": ..., "dayStart": ... },
      "comment": { "hourly": 1, "daily": 5, ... },
      "savedAt": "2026-03-18T..."
    }
  }
}
```

All data stored locally only. No server transmission.
