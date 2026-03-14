#!/usr/bin/env node

const { Command } = require('commander');
const { runCommand } = require('../src/runner');

const VERSION = require('../package.json').version;

const program = new Command();

program
  .name('viruagent-cli')
  .description('AI-agent-optimized CLI for blog publishing')
  .version(VERSION);

// --spec at root level
program
  .option('--spec', 'Output full command schema as JSON');

// Global options
const addProviderOption = (cmd) =>
  cmd.option('--provider <name>', 'Provider name (tistory or naver)', 'tistory');

const addDryRunOption = (cmd) =>
  cmd.option('--dry-run', 'Validate params without executing', false);

// --- Commands ---

const statusCmd = program
  .command('status')
  .description('Check provider login status');
addProviderOption(statusCmd);
statusCmd.action((opts) => execute('status', opts));

program
  .command('auth-status')
  .description('Alias for status')
  .copyInheritedSettings(program)
  .action((opts) => execute('auth-status', { provider: 'tistory', ...opts }));
addProviderOption(program.commands[program.commands.length - 1]);

const loginCmd = program
  .command('login')
  .description('Authenticate with a provider');
addProviderOption(loginCmd);
addDryRunOption(loginCmd);
loginCmd
  .option('--username <username>', 'Account username')
  .option('--password <password>', 'Account password')
  .option('--headless', 'Run browser in headless mode', false)
  .option('--manual', 'Use manual login mode', false)
  .option('--two-factor-code <code>', '2FA verification code')
  .action((opts) => execute('login', opts));

const publishCmd = program
  .command('publish')
  .description('Publish a blog post');
addProviderOption(publishCmd);
addDryRunOption(publishCmd);
publishCmd
  .option('--title <title>', 'Post title', '')
  .option('--content <html>', 'Post content as HTML string')
  .option('--content-file <path>', 'Path to HTML content file')
  .option('--visibility <level>', 'Post visibility (public, private)', 'public')
  .option('--category <id>', 'Category ID (integer)')
  .option('--tags <tags>', 'Comma-separated tags', '')
  .option('--thumbnail <url>', 'Thumbnail image URL')
  .option('--related-image-keywords <keywords>', 'Comma-separated image search keywords')
  .option('--image-urls <urls>', 'Comma-separated image URLs')
  .option('--image-upload-limit <n>', 'Max images to upload', '1')
  .option('--minimum-image-count <n>', 'Minimum required images', '1')
  .option('--no-auto-upload-images', 'Disable automatic image uploading')
  .option('--no-enforce-system-prompt', 'Disable system prompt enforcement')
  .action((opts) => execute('publish', opts));

const saveDraftCmd = program
  .command('save-draft')
  .description('Save a post as draft');
addProviderOption(saveDraftCmd);
addDryRunOption(saveDraftCmd);
saveDraftCmd
  .option('--title <title>', 'Post title', '')
  .option('--content <html>', 'Post content as HTML string')
  .option('--content-file <path>', 'Path to HTML content file')
  .option('--tags <tags>', 'Comma-separated tags', '')
  .option('--category <id>', 'Category ID (integer)')
  .option('--related-image-keywords <keywords>', 'Comma-separated image search keywords')
  .option('--image-urls <urls>', 'Comma-separated image URLs')
  .option('--image-upload-limit <n>', 'Max images to upload', '1')
  .option('--minimum-image-count <n>', 'Minimum required images', '1')
  .option('--no-auto-upload-images', 'Disable automatic image uploading')
  .option('--no-enforce-system-prompt', 'Disable system prompt enforcement')
  .action((opts) => execute('save-draft', opts));

const listCategoriesCmd = program
  .command('list-categories')
  .description('List available categories');
addProviderOption(listCategoriesCmd);
listCategoriesCmd.action((opts) => execute('list-categories', opts));

const listPostsCmd = program
  .command('list-posts')
  .description('List recent posts');
addProviderOption(listPostsCmd);
listPostsCmd
  .option('--limit <n>', 'Number of posts to retrieve', '20')
  .action((opts) => execute('list-posts', opts));

const readPostCmd = program
  .command('read-post')
  .description('Read a specific post');
addProviderOption(readPostCmd);
readPostCmd
  .option('--post-id <id>', 'Post ID to read')
  .option('--include-draft', 'Include draft posts', false)
  .argument('[postId]', 'Post ID (alternative to --post-id)')
  .action((postIdArg, opts) => {
    if (postIdArg && !opts.postId) opts.postId = postIdArg;
    execute('read-post', opts);
  });

const logoutCmd = program
  .command('logout')
  .description('Log out from a provider');
addProviderOption(logoutCmd);
addDryRunOption(logoutCmd);
logoutCmd.action((opts) => execute('logout', opts));

const listProvidersCmd = program
  .command('list-providers')
  .description('List supported providers');
listProvidersCmd.action((opts) => execute('list-providers', opts));

const installSkillCmd = program
  .command('install-skill')
  .description('Install viruagent skill for Claude Code / Codex')
  .option('--target <dir>', 'Target directory for skill file', '')
  .action((opts) => execute('install-skill', opts));

// --- Spec generation ---

function extractSpec(cmd) {
  const spec = {
    name: cmd.name(),
    description: cmd.description(),
    args: [],
    options: [],
  };

  for (const arg of cmd.registeredArguments || []) {
    spec.args.push({
      name: arg.name(),
      required: arg.required,
      description: arg.description,
    });
  }

  for (const opt of cmd.options) {
    if (opt.long === '--version') continue;
    if (opt.long === '--spec') continue;
    spec.options.push({
      flags: opt.flags,
      description: opt.description,
      required: opt.required,
      default: opt.defaultValue,
    });
  }

  return spec;
}

function generateFullSpec() {
  const commands = {};
  for (const cmd of program.commands) {
    commands[cmd.name()] = extractSpec(cmd);
  }
  return {
    name: program.name(),
    version: VERSION,
    description: program.description(),
    commands,
  };
}

// --- Execution ---

function output(obj, exitCode = 0) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
  process.exit(exitCode);
}

async function execute(command, opts) {
  try {
    const result = await runCommand(command, opts);
    output({ ok: true, data: result });
  } catch (err) {
    const errorCode = err.code || 'UNKNOWN_ERROR';
    const response = {
      ok: false,
      error: errorCode,
      message: err.message,
    };
    if (err.hint) response.hint = err.hint;
    output(response, 1);
  }
}

// Handle --spec before parse
const rawArgs = process.argv.slice(2);

if (rawArgs.includes('--spec')) {
  const specIdx = rawArgs.indexOf('--spec');
  const commandName = rawArgs.find((a, i) => i !== specIdx && !a.startsWith('-'));

  if (commandName) {
    const cmd = program.commands.find((c) => c.name() === commandName);
    if (!cmd) {
      output({ ok: false, error: 'UNKNOWN_COMMAND', message: `Unknown command: ${commandName}` }, 1);
    } else {
      output({ ok: true, data: extractSpec(cmd) });
    }
  } else {
    output({ ok: true, data: generateFullSpec() });
  }
} else {
  // Suppress commander's default error output
  program.exitOverride();
  program.configureOutput({
    writeOut: () => {},
    writeErr: () => {},
  });

  try {
    program.parse();
  } catch (err) {
    if (err.code === 'commander.unknownCommand') {
      const unknownCmd = rawArgs.find((a) => !a.startsWith('-'));
      output({
        ok: false,
        error: 'UNKNOWN_COMMAND',
        message: `Unknown command: ${unknownCmd}`,
        hint: 'viruagent-cli --spec',
      }, 1);
    } else if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version') {
      process.exit(0);
    } else {
      output({
        ok: false,
        error: 'INVALID_ARGS',
        message: err.message,
        hint: 'viruagent-cli --spec',
      }, 1);
    }
  }

  // If no command given
  if (!rawArgs.length) {
    output({
      ok: false,
      error: 'MISSING_COMMAND',
      message: 'No command provided',
      hint: 'viruagent-cli --spec',
    }, 1);
  }
}
