
![viru_run2](https://github.com/user-attachments/assets/76be6d06-3f0d-44e5-8152-d64b2fc68894)

<p align="center">
  <a href="README.ko.md"><img src="https://img.shields.io/badge/한국어-red?style=for-the-badge" alt="Korean"></a>
  <a href="README.md"><img src="https://img.shields.io/badge/English-blue?style=for-the-badge" alt="English"></a>
</p>

**A CLI tool where AI agents write, tag, and publish blog posts automatically.**

Designed not for humans, but for **AI agents**.

## How It Works

Operates via **CLI + skill files**. The CLI handles the interface; the skill file (`viruagent.md`) instructs the AI agent on workflow, formatting, and rules.

```
User: "Write a blog post"
  → Skill instructs the agent on workflow
    → Agent calls CLI (login, list categories, publish, etc.)

User: /viruagent "Write a post"
  → Direct skill invocation
```

- **Skill file**: Defines what to do and in what order (post structure, tag rules, image settings)
- **CLI**: Executes tasks per skill instructions (login, API calls, browser automation)
- **Agent**: Reads the skill and orchestrates CLI commands autonomously
- **Custom**: Edit the skill file to customize behavior

## Installation

![viru_install](https://github.com/user-attachments/assets/35efb57f-fada-44c0-8dd4-6d586ef33a7c)

Copy the following to your AI agent:

```
You are installing viruagent-cli, a blog publishing CLI tool. Follow these steps in order.

Step 1: Verify CLI
npx viruagent-cli --spec
If the output contains "ok": true, the CLI is ready. If it fails, check that Node.js
>= 18 is installed.

Step 2: Install skill
npx viruagent-cli install-skill
This copies the skill file to ~/.claude/commands/viruagent.md. Confirm the file
exists before proceeding.

Tell the user that viruagent-cli installation is complete.
```

## Login

```bash
# Import session from Chrome (no ID/PW needed, macOS only)
npx viruagent-cli login --from-chrome

# Use a specific Chrome profile
npx viruagent-cli login --from-chrome --profile "Profile 2"

# Traditional Kakao login (ID/PW required)
npx viruagent-cli login --username <id> --password <pw> --headless
```

`--from-chrome` decrypts Chrome's cookie database directly via macOS Keychain. No browser launch, no 2FA — completes in under 1 second.

## Usage

| Say this | Agent handles |
|---|---|
| "Write a blog post" | Login → Categories → Draft → Tags → Publish |
| "Save as draft" | Same flow, saves as draft instead |
| "Show recent posts" | Lists recent published posts |
| "What categories?" | Lists available categories |

Ask the agent for detailed usage or customization help.

## Supported Environments

| Item | Status |
| --- | --- |
| Claude Code, Codex, Cursor, etc. | Supported |
| Any AI agent with bash access | Supported |
| Node.js | >= 18 |

## Supported Platforms

| Platform | Status |
| --- | --- |
| Tistory | Supported |
| Naver Blog | Planned |

## Tech Stack

| Area | Tech | Description |
| --- | --- | --- |
| CLI Framework | Commander.js | Command definitions, option parsing, `--spec` schema |
| Browser Automation | Playwright (Chromium) | Login automation |
| Cookie Decryption | macOS Keychain + AES-128-CBC | Chrome session import (`--from-chrome`) |
| Session Management | JSON file (`~/.viruagent-cli/`) | Cookie-based session save/restore |
| Image Search | DuckDuckGo, Wikimedia, Commons | Keyword-based auto image search |
| Output Format | JSON envelope | `{ ok, data }` / `{ ok, error, hint }` |

## Contributing

PRs and feedback are welcome!

1. **Bug reports** — [Issues](https://github.com/greekr4/viruagent-cli/issues)
2. **Feature requests** — Tag with `[Feature Request]`
3. **Code contributions** — Fork → Branch → PR

```bash
git clone https://github.com/<your-username>/viruagent-cli.git
git checkout -b feature/my-feature
git commit -m "[FEAT] Add my feature"
git push origin feature/my-feature
```

## License

MIT
