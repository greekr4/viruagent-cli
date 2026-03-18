---
name: viruagent-tistory
description: Tistory blog publishing via viruagent-cli. Login, categories, content creation, image upload, and publishing.
triggers:
  - 티스토리
  - tistory
  - 티스토리 블로그
  - tistory blog
---

# viruagent-tistory — Tistory Blog Publishing Skill

You are a Tistory blog publishing agent using `viruagent-cli`. Always use `--provider tistory`.

## Step 1: Check authentication

```bash
npx viruagent-cli status --provider tistory
```

If not logged in:

```bash
npx viruagent-cli login --provider tistory --username <kakao_id> --password <pass> --headless
```

If 2FA is required (`pending_2fa`), ask the user to approve in Kakao app, then retry status check.

Environment variables: `TISTORY_USERNAME` / `TISTORY_PASSWORD`

## Step 2: Get categories

```bash
npx viruagent-cli list-categories --provider tistory
```

Ask the user which category to use if not specified.

## Step 3: Create content

Write content in HTML using the Tistory template. Tistory uses `data-ke-*` attributes.

### HTML Template

```html
<!-- 1. Hook -->
<blockquote data-ke-style="style2">[One impactful sentence]</blockquote>
<p data-ke-size="size16">&nbsp;</p>

<!-- 2. Introduction (2~3 paragraphs) -->
<p data-ke-size="size18">[Context and reader empathy, 3~5 sentences]</p>
<p data-ke-size="size18">[What this post covers]</p>
<p data-ke-size="size16">&nbsp;</p>

<!-- 3. Body (3~4 sections) -->
<h2>[Section Title]</h2>
<p data-ke-size="size18">[3~5 sentences with evidence]</p>
<p data-ke-size="size18">[Analysis and implications]</p>
<p data-ke-size="size16">&nbsp;</p>

<!-- Repeat for 2~3 more sections -->

<!-- 4. Summary -->
<h2>핵심 정리</h2>
<ul>
  <li>[Takeaway 1]</li>
  <li>[Takeaway 2]</li>
  <li>[Takeaway 3]</li>
</ul>
<p data-ke-size="size16">&nbsp;</p>

<!-- 5. Closing -->
<p data-ke-size="size18">[Specific actionable suggestion]</p>
```

### Tistory-Specific Rules

- Use `<p data-ke-size="size18">` for body text
- Use `<p data-ke-size="size16">&nbsp;</p>` for spacing
- Use `<blockquote data-ke-style="style2">` for hook

## Step 4: Publish

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

For drafts: `save-draft` instead of `publish`.

### Image Rules

- Always include `--related-image-keywords` with 2~3 English keywords
- Set `--image-upload-limit 2` and `--minimum-image-count 1`
- Never use `--no-auto-upload-images` unless user explicitly asks

## Step 5: Verify

```bash
npx viruagent-cli list-posts --provider tistory --limit 1
```

## Other Commands

```bash
npx viruagent-cli read-post --provider tistory --post-id <id>
npx viruagent-cli list-posts --provider tistory --limit 10
npx viruagent-cli logout --provider tistory
```
