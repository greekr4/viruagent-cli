# X (Twitter) Guide

X automation via internal GraphQL API. Works via pure HTTP — no browser needed for reads. Cookie-based authentication.

## Login

Extract `auth_token` and `ct0` cookies from your browser (DevTools → Application → Cookies → x.com).

```bash
npx viruagent-cli login --provider x --auth-token <auth_token> --ct0 <ct0>
```

### Environment Variables

```bash
export X_AUTH_TOKEN=<auth_token cookie>
export X_CT0=<ct0 cookie>

# With env vars set, flags can be omitted
npx viruagent-cli login --provider x
```

### Session Duration

The `auth_token` cookie is valid for **~1 year**. The `ct0` (CSRF token) may rotate but is auto-refreshed.

## Features (16 Methods)

### Authentication
| Command | Description |
|---------|-------------|
| `login` | Set auth_token + ct0 cookies, verify via Viewer query |
| `auth-status` | Check login status, show username and metadata |
| `logout` | Clear session and provider metadata |

### Read Operations
| Command | Description |
|---------|-------------|
| `get-profile --username <name>` | User profile (followers, tweets, bio, etc.) |
| `get-feed` | Home timeline (latest tweets from followed accounts) |
| `list-posts --username <name>` | User's tweets |
| `read-post --post-id <id>` | Tweet detail (likes, retweets, replies, media) |
| `search --query <text>` | Search tweets |

### Write Operations
| Command | Description |
|---------|-------------|
| `publish --content <text>` | Post a tweet (with optional media) |
| `delete --post-id <id>` | Delete a tweet |

### Interactions
| Command | Description |
|---------|-------------|
| `like --post-id <id>` | Like a tweet |
| `unlike --post-id <id>` | Unlike a tweet |
| `retweet --post-id <id>` | Retweet |
| `unretweet --post-id <id>` | Undo retweet |
| `follow --username <name>` | Follow a user |
| `unfollow --username <name>` | Unfollow a user |

### Utilities
| Command | Description |
|---------|-------------|
| `rate-limit-status` | Show current rate limit counters |
| `sync-operations` | Force re-sync GraphQL queryIds from x.com |

## GraphQL QueryId Dynamic Sync

X uses internal GraphQL APIs where each operation has a `queryId` that **changes on every X deployment**. viruagent-cli handles this automatically:

1. Fetches `https://x.com` HTML → extracts `main.{hash}.js` URL
2. Downloads main.js → parses all `queryId` / `operationName` / `featureSwitches` mappings
3. Caches to `~/.viruagent-cli/x-graphql-cache.json` (1-hour TTL)
4. On API failure (stale queryId) → auto re-syncs and retries

Currently extracts **166 GraphQL operations** including CreateTweet, DeleteTweet, FavoriteTweet, UserByScreenName, SearchTimeline, HomeLatestTimeline, etc.

## Rate Limits

New account (0–30 days):

| Action | Delay | Hourly | Daily |
|--------|-------|--------|-------|
| Tweet | 120–300s (2–5min) | 10 | 50 |
| Like | 30–60s | 15 | 200 |
| Retweet | 60–120s | 10 | 50 |
| Follow | 120–180s | 10 | 100 |
| Unfollow | 120–180s | 8 | 80 |

- Hard cap: 2,400 tweets/day (includes replies and quotes)
- **226 error** = automated behavior detected → wait 12–48 hours
- Counters persist in session file across CLI restarts
- Random jitter applied to all delays (±30%)

### 226 Error Triggers

- Burst actions without human-like variance
- Repetitive content
- Write-only patterns (no read behavior)
- New account + high volume
- Fixed intervals between actions

## Media Upload

Supports image upload via chunked upload to `upload.x.com`:

```bash
npx viruagent-cli publish --provider x --content "Hello world" --media /path/to/image.jpg
```

## Notes

- **Read operations** (profile, timeline, search) work reliably via HTTP API
- **Write operations** (tweet, retweet) may trigger 226 on new accounts — use browser fallback if needed
- **Like/unlike, follow/unfollow** work via HTTP API even on new accounts
- GraphQL queryIds are automatically refreshed — no manual maintenance needed
