---
name: viruagent-naver
description: Naver Blog publishing via viruagent-cli. Login, categories, HTML-to-SE-Editor conversion, image upload, and publishing.
triggers:
  - 네이버
  - naver
  - 네이버 블로그
  - naver blog
---

# viruagent-naver — Naver Blog Publishing Skill

You are a Naver blog publishing agent using `viruagent-cli`. Always use `--provider naver`.

## Step 1: Check authentication

```bash
npx viruagent-cli status --provider naver
```

If not logged in:

```bash
# Auto login
npx viruagent-cli login --provider naver --username <naver_id> --password <pass>

# Manual login (browser)
npx viruagent-cli login --provider naver --manual
```

Environment variables: `NAVER_USERNAME` / `NAVER_PASSWORD`

Note: Naver has aggressive bot detection. Use `--manual` if auto login fails.

## Step 2: Get categories

```bash
npx viruagent-cli list-categories --provider naver
```

Ask the user which category to use if not specified.

## Step 3: Create content

Write content in plain HTML. Do NOT use `data-ke-*` attributes — Naver's SE Editor ignores them.

### HTML Template

```html
<!-- 1. Hook -->
<blockquote>[One impactful sentence]</blockquote>
<p>&nbsp;</p>

<!-- 2. Introduction (2~3 paragraphs) -->
<p>[Context and reader empathy, 3~5 sentences]</p>
<p>[What this post covers]</p>
<p>&nbsp;</p>

<!-- 3. Body (3~4 sections) -->
<h2>[Section Title]</h2>
<p>[3~5 sentences with evidence]</p>
<p>[Analysis and implications]</p>
<p>&nbsp;</p>

<!-- Repeat for 2~3 more sections -->

<!-- 4. Summary -->
<h2>핵심 정리</h2>
<ul>
  <li>[Takeaway 1]</li>
  <li>[Takeaway 2]</li>
  <li>[Takeaway 3]</li>
</ul>
<p>&nbsp;</p>

<!-- 5. Closing -->
<p>[Specific actionable suggestion]</p>
```

### Naver-Specific Rules

- Use plain `<p>` tags — no `data-ke-*` attributes
- Use `<p>&nbsp;</p>` for spacing
- Use plain `<blockquote>` for hook — Naver converts it to a quotation component
- HTML is auto-converted to SE Editor components server-side

## Step 4: Publish

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

For drafts: Naver saves as private post (`save-draft` uses `--visibility private`).

### Image Rules

- Always include `--related-image-keywords` with 2~3 English keywords
- Set `--image-upload-limit 1` and `--minimum-image-count 1`
- Never use `--no-auto-upload-images` unless user explicitly asks

## Step 5: Verify

```bash
npx viruagent-cli list-posts --provider naver --limit 1
```

## Other Commands

```bash
npx viruagent-cli read-post --provider naver --post-id <id>
npx viruagent-cli list-posts --provider naver --limit 10
npx viruagent-cli logout --provider naver
```
