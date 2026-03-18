
<p align="center">
  <img src="https://github.com/user-attachments/assets/76be6d06-3f0d-44e5-8152-d64b2fc68894" alt="viruagent-cli" />
</p>

<h1 align="center">viruagent-cli</h1>

<p align="center">
  <a href="https://github.com/greekr4/viruagent-cli/stargazers"><img src="https://img.shields.io/github/stars/greekr4/viruagent-cli" alt="GitHub stars"></a>
</p>
<p align="center">
  <a href="https://www.npmjs.com/package/viruagent-cli"><img src="https://img.shields.io/npm/v/viruagent-cli?color=blue" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/viruagent-cli" alt="license"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/viruagent-cli" alt="node version"></a>
</p>
<p align="center">
  <a href="README.md"><img src="https://img.shields.io/badge/English-blue" alt="English"></a>
  <a href="README.ko.md"><img src="https://img.shields.io/badge/한국어-red" alt="Korean"></a>
</p>

**A CLI tool where AI agents write, publish, and engage across blog & social platforms automatically.**

Designed not for humans, but for **AI agents**.

## Supported Platforms

| Platform | Login | Features | Guide |
|----------|-------|----------|-------|
| **Tistory** | Playwright (Kakao) | Publish, Draft, Categories, Image Upload | [Guide](docs/en/guide-tistory.md) |
| **Naver Blog** | Playwright (Naver) | Publish, Categories, SE Editor, Image Upload | [Guide](docs/en/guide-naver.md) |
| **Instagram** | HTTP (No Browser) | Like, Comment, Follow, Post, Profile, Feed, Rate Limit | [Guide](docs/en/guide-instagram.md) |

## How It Works

Operates via **CLI + skill files**. The CLI handles the interface; the skill file (`viruagent.md`) instructs the AI agent on workflow, formatting, and rules.

```
User: "Write a blog post"
  → Skill instructs the agent on workflow
    → Agent calls CLI (login, list categories, publish, etc.)

User: "Like and comment on all posts from @username"
  → Agent uses Instagram provider (login, listPosts, like, analyzePost, comment)
```

- **Skill file**: Defines what to do and in what order
- **CLI**: Executes tasks per skill instructions
- **Agent**: Reads the skill and orchestrates commands autonomously
- **Custom**: Edit the skill file to customize behavior

## Quick Start

![viru_install](https://github.com/user-attachments/assets/35efb57f-fada-44c0-8dd4-6d586ef33a7c)

Copy the following to your AI agent:

```
You are installing viruagent-cli, a blog publishing CLI tool. Follow these steps in order.

Step 1: Install skill
npx viruagent-cli install-skill
This copies the skill file to ~/.claude/commands/viruagent.md. Confirm the file
exists before proceeding.

Step 2: Verify CLI
npx viruagent-cli --spec
If the output contains "ok": true, the CLI is ready. If it fails, check that Node.js
>= 18 is installed.

Tell the user that viruagent-cli installation is complete.
```

## Login

### Tistory

```bash
npx viruagent-cli login --provider tistory --username <kakao_id> --password <pw> --headless
```
> "Login to Tistory" — Agent handles it automatically

### Naver Blog

```bash
npx viruagent-cli login --provider naver --username <id> --password <pw>
```
> "Login to Naver Blog" — Agent handles it automatically

### Instagram

```bash
npx viruagent-cli login --provider insta --username <id> --password <pw>
```
> "Login to Instagram" — Agent handles it automatically
>
> See the [Instagram Guide](docs/en/guide-instagram.md) for full API reference and rate limit rules.

## Usage

| Say this | Agent handles |
|---|---|
| "Write a blog post on Tistory" | Login → Categories → Draft → Tags → Publish |
| "Post to Naver Blog" | Naver login → Categories → Publish |
| "Save as draft" | Same flow, saves as draft instead |
| "Show recent posts" | Lists recent published posts |
| "Like all posts from @user" | Login → listPosts → like (with rate limit) |
| "Analyze and comment on @user's feed" | analyzePost → AI generates comment → comment |
| "Follow @user" | Login → follow (with delay) |
| "Check Instagram rate limit" | rate-limit-status → show counters |

## Platform Guides

- **[Tistory Guide](docs/en/guide-tistory.md)** — Blog publishing, image upload, categories
- **[Naver Blog Guide](docs/en/guide-naver.md)** — SE Editor, blog publishing, image upload
- **[Instagram Guide](docs/en/guide-instagram.md)** — 18 API methods, rate limits, AI commenting

## Supported Environments

| Item | Status |
| --- | --- |
| Claude Code, Codex, Cursor, etc. | Supported |
| Any AI agent with bash access | Supported |
| Node.js | >= 18 |

## Tech Stack

| Area | Tech |
| --- | --- |
| CLI Framework | Commander.js |
| Browser Automation | Playwright (Tistory, Naver only) |
| Instagram API | Pure HTTP fetch (no browser) |
| Session Management | JSON file (`~/.viruagent-cli/`) |
| Rate Limiting | Per-user persistent counters with random delays |
| Image Search | DuckDuckGo, Wikimedia Commons |
| Naver Editor | SE Editor component model + RabbitWrite API |
| Output Format | JSON envelope (`{ ok, data }` / `{ ok, error, hint }`) |

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
