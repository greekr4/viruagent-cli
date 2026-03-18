---
name: viruagent
description: viruagent-cli overview. Routes to platform-specific skills — /viruagent-tistory, /viruagent-naver, /viruagent-insta.
triggers:
  - 블로그
  - blog
  - viruagent
  - 블로그 써줘
  - publish blog
---

# viruagent — Platform Router

You are an agent using `viruagent-cli`. Route to the correct skill based on the user's request.

## Available Skills

| Skill | Platform | Triggers |
|-------|----------|----------|
| `/viruagent-tistory` | Tistory Blog | 티스토리, tistory |
| `/viruagent-naver` | Naver Blog | 네이버, naver blog |
| `/viruagent-insta` | Instagram | 인스타, instagram, 좋아요, 댓글, 팔로우 |

## Quick Reference

```bash
# Check available providers
npx viruagent-cli list-providers

# Check CLI schema
npx viruagent-cli --spec
```

All responses are JSON: `{ "ok": true, "data": {...} }` on success, `{ "ok": false, "error": "...", "message": "...", "hint": "..." }` on failure.

## Routing Rules

- User says "블로그 써줘" without specifying platform → ask which platform (Tistory or Naver)
- User says "티스토리" or "tistory" → use `/viruagent-tistory`
- User says "네이버" or "naver" → use `/viruagent-naver`
- User says "인스타" or mentions like/comment/follow → use `/viruagent-insta`

## Writing Rules (Shared)

These rules apply to both Tistory and Naver blog publishing:

- **Title**: Include the primary keyword. 10~20 characters. Short and impactful.
- **Length**: 3000~4000 characters. Aim for depth, not padding.
- **Paragraphs**: 3~5 sentences each. Do NOT write 1~2 sentence paragraphs repeatedly.
- **Introduction**: 2~3 paragraphs that set context and build reader empathy.
- **Body sections**: Each h2 section must have 2~3 substantial paragraphs. Do NOT jump straight to bullet lists.
- **Lists**: Use sparingly — only for 3+ concrete, scannable items.
- **Evidence**: Each body section should include at least one of: expert quote, data point, real example.
- **Perspective shift**: Include at least one moment that reframes the reader's thinking.
- **Transitions**: Connect sections with bridge sentences.
- **Bold**: Use `<strong>` for key terms (2~3 per section max).
- **Subheadings**: Use `<h2>` for ALL section titles. Do NOT use `<h3>`.
- **Tone**: Conversational but substantive.
- **Closing**: End with a specific, actionable suggestion.
- **SEO**: Primary keyword in title, first paragraph, and at least one `<h2>`.
- **Tags**: Exactly 5, comma-separated, matching post language.

## Error Recovery

| Error | Action |
|---|---|
| `NOT_LOGGED_IN` / `SESSION_EXPIRED` | Run `login` again |
| `MISSING_CONTENT` | Ensure `--content` or `--content-file` is provided |
| `PROVIDER_NOT_FOUND` | Check with `list-providers` |
| `INVALID_POST_ID` | Verify post ID with `list-posts` |

## Important Notes

- Always use `--dry-run` before actual publish to validate parameters
- Content must be valid HTML
- Default provider is `tistory`
- For `--content-file`, use absolute paths
