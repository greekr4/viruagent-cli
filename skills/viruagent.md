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
<!-- 1. Hook (blockquote style2 for topic quote) -->
<blockquote data-ke-style="style2">[One impactful sentence about the topic]</blockquote>
<p data-ke-size="size16">&nbsp;</p>

<!-- 2. Introduction (what this post covers, what the reader will learn) -->
<p>[Brief overview — set expectations clearly]</p>
<p data-ke-size="size16">&nbsp;</p>

<!-- 3. Body (2~4 sections with h2/h3, short paragraphs, lists) -->
<!-- Use <p data-ke-size="size16">&nbsp;</p> between sections for spacing -->
<h2>[Section 1 Title — keyword-rich]</h2>
<p>[Short paragraph, max 2~3 sentences]</p>
<ul>
  <li>[Key point]</li>
  <li>[Key point]</li>
</ul>

<h2>[Section 2 Title]</h2>
<p>[Short paragraph]</p>

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
- **Paragraphs**: Max 2~3 sentences each. Break long ideas into multiple paragraphs for readability.
- **Spacing**: Use `<p data-ke-size="size16">&nbsp;</p>` between sections for line breaks (Tistory-specific).
- **Hook**: Always use `<blockquote data-ke-style="style2">` for the opening topic quote.
- **Lists**: Use `<ul>` or `<ol>` for 3+ items. Easier to scan.
- **Subheadings**: Use `<h2>` for ALL section titles. Do NOT use `<h3>`. Keep heading sizes consistent.
- **Tone**: Conversational but informative. Avoid jargon unless the audience expects it.
- **Length**: 1500~2000 characters (한글 기준) for standard posts. Do NOT exceed 2000 characters.
- **SEO**: Primary keyword in title, first paragraph, and at least one `<h2>`. Don't keyword-stuff.

```bash
npx viruagent-cli publish \
  --provider tistory \
  --title "Post Title" \
  --content "<h2>...</h2><p>...</p>" \
  --category <id> \
  --tags "tag1,tag2,tag3,tag4,tag5" \
  --visibility public \
  --related-image-keywords "keyword1,keyword2" \
  --image-upload-limit 2 \
  --minimum-image-count 1 \
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
  --visibility public \
  --related-image-keywords "keyword1,keyword2" \
  --image-upload-limit 2 \
  --minimum-image-count 1
```

For drafts, use `save-draft` instead of `publish`.

### Image Rules (MUST FOLLOW)

- **Always** include `--related-image-keywords` with 2~3 keywords relevant to the post topic
- **Always** set `--image-upload-limit 2` and `--minimum-image-count 1`
- Keywords should be in English for better image search results
- Never use `--no-auto-upload-images` unless the user explicitly asks

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
