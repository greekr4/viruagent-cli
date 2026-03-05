# viruagent-cli

AI agent tool for automated blog publishing to Tistory (Naver planned).

## Install

```bash
npx viruagent-cli install-skill
```

This copies the skill file to `~/.claude/commands/viruagent.md`. No other setup needed.

## Verify

```bash
npx viruagent-cli --spec
```

If JSON output with `{ "ok": true }` is returned, installation is successful.

## First-time Login

```bash
npx viruagent-cli status --provider tistory
```

If `loggedIn` is `false`:

```bash
npx viruagent-cli login --provider tistory --username "<email>" --password "<password>" --headless
```

If response contains `pending_2fa`: ask the user to approve on their mobile Kakao app, then re-check with `status`.

## Usage

After install, the user can give natural language commands:

| User says | Agent does |
|---|---|
| "이거 설치해줘" | `npx viruagent-cli install-skill` |
| "사용법 알려줘" | `npx viruagent-cli --spec` → explain commands |
| "블로그 써줘" | status → login → list-categories → write content → generate 5 tags → dry-run → publish |
| "임시저장해줘" | Same flow but use `save-draft` instead of `publish` |
| "최근 글 보여줘" | `npx viruagent-cli list-posts --limit 10` |
| "카테고리 뭐 있어?" | `npx viruagent-cli list-categories` |

## Response Format

All commands return JSON to stdout:

```
Success (exit 0): { "ok": true, "data": { ... } }
Failure (exit 1): { "ok": false, "error": "<CODE>", "message": "...", "hint": "..." }
```

## Error → Recovery

| error | run |
|---|---|
| `NOT_LOGGED_IN` | `login --provider tistory --username ... --password ... --headless` |
| `SESSION_EXPIRED` | same as above |
| `MISSING_CONTENT` | add `--content "<html>"` or `--content-file <path>` |
| `PROVIDER_NOT_FOUND` | `list-providers` |
| `UNKNOWN_COMMAND` | `--spec` |
