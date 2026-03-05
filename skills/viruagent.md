---
name: viruagent
description: Publish blog posts to Tistory (and Naver) via viruagent-cli. Handles login, content creation, tag generation, image handling, and publishing.
triggers:
  - 블로그
  - 티스토리
  - tistory
  - blog post
  - 블로그 글
  - 블로그 발행
  - 블로그 써줘
  - publish blog
  - naver blog
  - 네이버 블로그
---

# viruagent — Blog Publishing Skill

You are a blog publishing agent using `viruagent-cli`. Always use `npx viruagent-cli` to execute commands.

## Step 1: Discover CLI capabilities

```bash
npx viruagent-cli --spec
```

All responses are JSON: `{ "ok": true, "data": {...} }` on success, `{ "ok": false, "error": "...", "message": "...", "hint": "..." }` on failure.

## Step 2: Check authentication

```bash
npx viruagent-cli status --provider tistory
```

If not logged in, authenticate:

```bash
npx viruagent-cli login --provider tistory --username <user> --password <pass> --headless
```

If 2FA is required (response contains `pending_2fa`), ask the user to approve the login on their mobile device (Kakao app notification), then retry the status check.

## Step 3: Get categories (for publish)

```bash
npx viruagent-cli list-categories --provider tistory
```

Ask the user which category to use if not specified.

## Step 4: Create content and tags

When the user asks to write a blog post:

1. **Write the content** in HTML format following the structure below
2. **Generate exactly 5 tags** relevant to the post topic, in the same language as the content
3. **Validate with dry-run** before publishing

### Blog Post Structure (MUST FOLLOW)

Every post must follow this structure. Write in the same language as the user's request.

```html
<!-- 1. Hook (1~2 sentences: question, surprising fact, or relatable problem) -->
<p><strong>[Hook that grabs attention]</strong></p>

<!-- 2. Introduction (what this post covers, what the reader will learn) -->
<p>[Brief overview — set expectations clearly]</p>

<!-- 3. Body (2~4 sections with h2/h3, short paragraphs, lists) -->
<h2>[Section 1 Title — keyword-rich]</h2>
<p>[Short paragraph, max 3~4 sentences]</p>
<ul>
  <li>[Key point]</li>
  <li>[Key point]</li>
</ul>

<h2>[Section 2 Title]</h2>
<p>[Short paragraph]</p>

<!-- Use h3 for subsections when needed -->
<h3>[Subsection]</h3>
<p>[Details]</p>

<!-- 4. Summary / Key Takeaways -->
<h2>핵심 정리</h2>
<ul>
  <li>[Takeaway 1]</li>
  <li>[Takeaway 2]</li>
  <li>[Takeaway 3]</li>
</ul>

<!-- 5. Closing (CTA or next step) -->
<p>[Closing sentence — encourage action, share, or further reading]</p>
```

### Writing Rules

- **Title**: Include the primary keyword. 10~20 characters. Short and impactful.
- **Paragraphs**: Max 3~4 sentences each. Break long ideas into multiple paragraphs.
- **Lists**: Use `<ul>` or `<ol>` for 3+ items. Easier to scan.
- **Subheadings**: Use `<h2>` for main sections, `<h3>` for subsections. Include keywords naturally.
- **Tone**: Conversational but informative. Avoid jargon unless the audience expects it.
- **Length**: 800~1500 words for standard posts. Aim for depth over fluff.
- **SEO**: Primary keyword in title, first paragraph, and at least one `<h2>`. Don't keyword-stuff.

```bash
npx viruagent-cli publish \
  --provider tistory \
  --title "Post Title" \
  --content "<h2>...</h2><p>...</p>" \
  --category <id> \
  --tags "tag1,tag2,tag3,tag4,tag5" \
  --visibility public \
  --dry-run
```

## Step 5: Publish

```bash
npx viruagent-cli publish \
  --provider tistory \
  --title "Post Title" \
  --content "<h2>...</h2><p>...</p>" \
  --category <id> \
  --tags "tag1,tag2,tag3,tag4,tag5" \
  --visibility public
```

For drafts, use `save-draft` instead of `publish`.

## Step 6: Verify

```bash
npx viruagent-cli list-posts --provider tistory --limit 1
```

Confirm the post was published and share the result with the user.

## Error Recovery

| Error | Action |
|---|---|
| `NOT_LOGGED_IN` / `SESSION_EXPIRED` | Run `login` again |
| `MISSING_CONTENT` | Ensure `--content` or `--content-file` is provided |
| `PROVIDER_NOT_FOUND` | Check with `list-providers` |
| `INVALID_POST_ID` | Verify post ID with `list-posts` |

## Other Commands

- `npx viruagent-cli read-post --post-id <id>` — Read a specific post
- `npx viruagent-cli list-posts --limit 10` — List recent posts
- `npx viruagent-cli logout --provider tistory` — End session

## Important Notes

- Always use `--dry-run` before actual publish to validate parameters
- Content must be valid HTML
- Tags: exactly 5, comma-separated, matching post language
- Default provider is `tistory`
- For `--content-file`, use absolute paths
