You are installing viruagent-cli, a blog publishing CLI tool. Follow these steps in order.

## Step 1: Install skill

```bash
npx viruagent-cli install-skill
```

This copies the skill file to `~/.claude/commands/viruagent.md`. Confirm the file exists before proceeding.

## Step 2: Verify CLI

```bash
npx viruagent-cli --spec
```

If the output contains `"ok": true`, the CLI is ready. If it fails, check that Node.js >= 18 is installed.

## Step 3: Login

```bash
npx viruagent-cli status --provider tistory
```

If `loggedIn` is `false`, ask the user for their Tistory email and password, then run:

```bash
npx viruagent-cli login --provider tistory --username "<email>" --password "<password>" --headless
```

If the response contains `pending_2fa`, tell the user to approve the login on their mobile Kakao app, then re-run the status command to confirm.

## Done

Tell the user installation is complete. They can now say "블로그 써줘" to start writing.
