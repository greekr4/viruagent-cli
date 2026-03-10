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

## Step 2: Authenticate (ALWAYS run --from-chrome first)

**IMPORTANT**: Always run `--from-chrome` login for ALL providers before doing anything else. This refreshes the session from the user's Chrome browser cookies and is the fastest, most reliable method.

```bash
# ALWAYS run these first, regardless of current status
npx viruagent-cli login --provider tistory --from-chrome
npx viruagent-cli login --provider naver --from-chrome
```

Run both in parallel. Only if `--from-chrome` fails, fall back to other methods:

### Tistory fallback

```bash
npx viruagent-cli login --provider tistory --username <user> --password <pass> --headless
```

If 2FA is required (response contains `pending_2fa`), ask the user to approve the login on their mobile device (Kakao app notification), then retry the status check.

### Naver fallback

```bash
# Manual login via browser
npx viruagent-cli login --provider naver --manual

# Auto login with credentials (NAVER_USERNAME / NAVER_PASSWORD env vars also work)
npx viruagent-cli login --provider naver --username <user> --password <pass>
```

## Step 3: Get categories (for publish)

```bash
npx viruagent-cli list-categories --provider <tistory|naver>
```

Ask the user which category to use if not specified.

## Step 4: Create content and tags

When the user asks to write a blog post:

1. **Write the content** in HTML format following the structure below
2. **Generate exactly 5 tags** relevant to the post topic, in the same language as the content
3. **Validate with dry-run** before publishing

### Blog Post Structure (MUST FOLLOW)

Every post must follow this structure. Write in the same language as the user's request.

#### Tistory HTML Template

Tistory uses `data-ke-*` attributes for styling.

```html
<!-- 1. Hook (blockquote style2 for topic quote) -->
<blockquote data-ke-style="style2">[One impactful sentence that captures the core insight or tension]</blockquote>
<p data-ke-size="size16">&nbsp;</p>

<!-- 2. Introduction (2~3 paragraphs: context, reader empathy, what this post covers) -->
<p data-ke-size="size18">[Describe the situation the reader relates to — paint a vivid picture, 3~5 sentences]</p>
<p data-ke-size="size18">[Set expectations: what angle this post takes, what the reader will gain]</p>
<p data-ke-size="size16">&nbsp;</p>

<!-- 3. Body (3~4 sections with h2, each section has 2~3 paragraphs) -->
<!-- Use <p data-ke-size="size16">&nbsp;</p> between sections for spacing -->
<h2>[Section 1 Title — keyword-rich]</h2>
<p data-ke-size="size18">[Explain the concept or situation in 3~5 sentences. Include evidence: expert quotes, data, or real-world examples]</p>
<p data-ke-size="size18">[Deepen the point with analysis, comparison, or implication. Connect to the reader's experience]</p>
<ul>
  <li>[Key point — only use lists for 3+ concrete items worth scanning]</li>
  <li>[Key point]</li>
  <li>[Key point]</li>
</ul>
<p data-ke-size="size16">&nbsp;</p>

<h2>[Section 2 Title]</h2>
<p data-ke-size="size18">[Introduce a new angle, case study, or supporting argument. 3~5 sentences with specific details]</p>
<p data-ke-size="size18">[Analyze why this matters. Use <strong>bold</strong> for key terms. Connect back to the main thesis]</p>
<p data-ke-size="size16">&nbsp;</p>

<h2>[Section 3 Title]</h2>
<p data-ke-size="size18">[Practical application or actionable insight. Show, don't just tell]</p>
<p data-ke-size="size18">[Bridge to the conclusion — "what this all means"]</p>
<p data-ke-size="size16">&nbsp;</p>

<!-- 4. Summary / Key Takeaways -->
<h2>핵심 정리</h2>
<ul>
  <li>[Takeaway 1 — one complete sentence, not a fragment]</li>
  <li>[Takeaway 2]</li>
  <li>[Takeaway 3]</li>
</ul>
<p data-ke-size="size16">&nbsp;</p>

<!-- 5. Closing (specific action the reader can take) -->
<p data-ke-size="size18">[Closing 1~2 sentences — suggest a concrete, immediate action. Not vague "stay tuned" but specific "try this tomorrow"]</p>
```

#### Naver Blog HTML Template

Naver converts HTML to editor components server-side. Do NOT use `data-ke-*` attributes. Use plain HTML with `<p>&nbsp;</p>` for spacing.

```html
<!-- 1. Hook -->
<blockquote>[One impactful sentence that captures the core insight or tension]</blockquote>
<p>&nbsp;</p>

<!-- 2. Introduction (2~3 paragraphs) -->
<p>[Describe the situation the reader relates to — paint a vivid picture, 3~5 sentences]</p>
<p>[Set expectations: what angle this post takes, what the reader will gain]</p>
<p>&nbsp;</p>

<!-- 3. Body (3~4 sections with h2, each section has 2~3 paragraphs) -->
<h2>[Section 1 Title — keyword-rich]</h2>
<p>[Explain the concept or situation in 3~5 sentences. Include evidence: expert quotes, data, or real-world examples]</p>
<p>[Deepen the point with analysis, comparison, or implication. Connect to the reader's experience]</p>
<ul>
  <li>[Key point — only use lists for 3+ concrete items worth scanning]</li>
  <li>[Key point]</li>
  <li>[Key point]</li>
</ul>
<p>&nbsp;</p>

<h2>[Section 2 Title]</h2>
<p>[Introduce a new angle, case study, or supporting argument. 3~5 sentences with specific details]</p>
<p>[Analyze why this matters. Use <strong>bold</strong> for key terms. Connect back to the main thesis]</p>
<p>&nbsp;</p>

<h2>[Section 3 Title]</h2>
<p>[Practical application or actionable insight. Show, don't just tell]</p>
<p>[Bridge to the conclusion — "what this all means"]</p>
<p>&nbsp;</p>

<!-- 4. Summary / Key Takeaways -->
<h2>핵심 정리</h2>
<ul>
  <li>[Takeaway 1 — one complete sentence, not a fragment]</li>
  <li>[Takeaway 2]</li>
  <li>[Takeaway 3]</li>
</ul>
<p>&nbsp;</p>

<!-- 5. Closing -->
<p>[Closing 1~2 sentences — suggest a concrete, immediate action]</p>
```

### Writing Rules

- **Title**: Include the primary keyword. 10~20 characters. Short and impactful.
- **Length**: 3000~4000 characters (한글 기준). Aim for depth, not padding.
- **Paragraphs**: 3~5 sentences each. Develop ideas fully within a paragraph before moving on. Do NOT write 1~2 sentence paragraphs repeatedly.
- **Font size (Tistory)**: Use `<p data-ke-size="size18">` for all body text paragraphs. Use `<p data-ke-size="size16">&nbsp;</p>` only for spacing between sections.
- **Font size (Naver)**: Use plain `<p>` tags. Do NOT use `data-ke-*` attributes — Naver's editor ignores them.
- **Spacing (Tistory)**: Use `<p data-ke-size="size16">&nbsp;</p>` between sections for line breaks.
- **Spacing (Naver)**: Use `<p>&nbsp;</p>` between sections.
- **Hook (Tistory)**: Always use `<blockquote data-ke-style="style2">` for the opening topic quote.
- **Hook (Naver)**: Use plain `<blockquote>` — Naver converts it to a quotation component.
- **Introduction**: 2~3 paragraphs that set context and build reader empathy before diving into the body.
- **Body sections**: Each h2 section must have 2~3 substantial paragraphs. Do NOT jump straight to bullet lists.
- **Lists**: Use sparingly — only for 3+ concrete, scannable items. Default to paragraphs for explanation and analysis.
- **Evidence**: Each body section should include at least one of: expert quote, data point, real company example, or research finding. Cite sources naturally within the text.
- **Perspective shift**: Include at least one moment that reframes the reader's thinking (e.g., "X is not about A, it's about B").
- **Transitions**: Connect sections with bridge sentences. Avoid abrupt jumps between topics.
- **Bold**: Use `<strong>` for key terms and concepts (2~3 per section max).
- **Subheadings**: Use `<h2>` for ALL section titles. Do NOT use `<h3>`. Keep heading sizes consistent.
- **Tone**: Conversational but substantive. Write as if explaining to a smart colleague, not listing facts for a report.
- **Closing**: End with a specific, actionable suggestion the reader can try immediately — not a vague "stay tuned."
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

### Tistory

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

### Naver Blog

```bash
npx viruagent-cli publish \
  --provider naver \
  --title "Post Title" \
  --content "<h2>...</h2><p>...</p>" \
  --category <id> \
  --tags "tag1,tag2,tag3,tag4,tag5" \
  --visibility public \
  --related-image-keywords "keyword1,keyword2" \
  --image-upload-limit 1 \
  --minimum-image-count 1
```

For drafts, use `save-draft` instead of `publish` (Naver saves as private post).

### Image Rules (MUST FOLLOW)

- **Always** include `--related-image-keywords` with 2~3 keywords relevant to the post topic
- **Tistory**: set `--image-upload-limit 2` and `--minimum-image-count 1`
- **Naver**: set `--image-upload-limit 1` and `--minimum-image-count 1`
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
