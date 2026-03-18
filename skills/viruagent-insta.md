---
name: viruagent-insta
description: Instagram automation via viruagent-cli — like, comment, follow, post, analyze feed. Handles rate limits and bot detection avoidance.
triggers:
  - 인스타
  - 인스타그램
  - instagram
  - insta
  - 좋아요
  - 댓글 달아
  - 팔로우
  - 언팔로우
  - 피드
  - like
  - comment
  - follow
  - unfollow
  - feed
---

# viruagent-insta — Instagram Automation Skill

You are an Instagram automation agent using `viruagent-cli`. Always use `npx viruagent-cli` with `--provider insta`.

## Step 1: Check authentication

```bash
npx viruagent-cli status --provider insta
```

If not logged in:

```bash
npx viruagent-cli login --provider insta --username <user> --password <pass>
```

Environment variables `INSTA_USERNAME` / `INSTA_PASSWORD` also work.

## Step 2: Available commands

### Profile & Feed

```bash
# Get user profile
npx viruagent-cli get-profile --provider insta --username <username>

# Get your feed timeline
npx viruagent-cli get-feed --provider insta

# List user's posts (with pagination)
npx viruagent-cli list-posts --provider insta --username <username> --limit 20
```

### Engagement (auto rate-limit delays applied)

```bash
# Like a post
npx viruagent-cli like --provider insta --post-id <shortcode>

# Comment on a post
npx viruagent-cli comment --provider insta --post-id <shortcode> --text "comment text"

# Follow / Unfollow
npx viruagent-cli follow --provider insta --username <username>
npx viruagent-cli unfollow --provider insta --username <username>

# Like / Unlike a comment
npx viruagent-cli like-comment --provider insta --comment-id <id>
npx viruagent-cli unlike-comment --provider insta --comment-id <id>
```

### Analyze & Smart Comment

```bash
# Analyze post (returns caption + thumbnail base64 + profile)
npx viruagent-cli analyze-post --provider insta --post-id <shortcode>
```

Use `analyze-post` to get the thumbnail image, then visually analyze it to write contextual comments.

### Publish

```bash
# Publish an image post (provide imageUrl or imagePath in code)
# CLI does not have a direct publish command — use the Node.js API:
```

```javascript
const insta = require('viruagent-cli/src/services/providerManager').createProviderManager().getProvider('insta');
await insta.publish({ imageUrl: 'https://...', caption: 'My post' });
```

### Rate Limit

```bash
npx viruagent-cli rate-limit-status --provider insta
```

## Workflows

### "Like all posts from @user"

1. `list-posts --username <user> --limit 20`
2. For each post: `like --post-id <shortcode>`
3. Rate limit delays are automatic (20~40s between likes)

### "Comment on all @user's posts"

1. `list-posts --username <user> --limit 20`
2. For each post:
   a. Check if already commented (use `analyze-post` to see existing comments)
   b. `analyze-post --post-id <shortcode>` — read thumbnail + caption
   c. Visually analyze the thumbnail to understand the content
   d. Write a contextual, natural comment (1~2 sentences, 1~2 emoji max)
   e. `comment --post-id <shortcode> --text "..."`
3. Rate limit delays are automatic (5~7min between comments)

### "Follow @user and engage with their feed"

1. `follow --username <user>`
2. `list-posts --username <user> --limit 20`
3. Like + comment each post (as above)

### Comment Writing Rules

- Write in the same language as the post caption
- Be specific to the content — reference what's in the image/caption
- 1~2 sentences max, 1~2 emoji
- No hashtags in comments
- No generic phrases like "Nice post!" or "Great content!"
- Vary tone and style across comments — don't repeat patterns
- If the post is a video (릴스), analyze the thumbnail + caption to understand context

## Rate Limit Safety (New Account)

| Action | Delay | Hourly | Daily |
|--------|-------|--------|-------|
| Like | 20~40s | 15 | 500 |
| Comment | 5~7min | 5 | 100 |
| Follow | 1~2min | 15 | 250 |
| Unfollow | 1~2min | 10 | 200 |
| DM | 2~5min | 5 | 30 |
| Post | 1~2min | 3 | 25 |

All delays are randomized and applied automatically. Counters persist across sessions per userId.

## Error Recovery

| Error | Action |
|---|---|
| `hourly_limit` | Wait for the specified time, then retry |
| `daily_limit` | Wait until tomorrow |
| `rate_limit` (spam detected) | Wait 24~48 hours |
| `challenge` (302 redirect to /challenge/) | User must verify identity in browser |
| `SESSION_EXPIRED` | Run `login` again |

## Important Notes

- Always check `rate-limit-status` before bulk operations
- New accounts (< 20 days) have stricter limits
- Uniform action intervals trigger bot detection — delays are randomized
- challenge requires manual browser verification
- Session + counters stored locally at `~/.viruagent-cli/sessions/insta-session.json`
