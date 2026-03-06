const fs = require('fs');
const path = require('path');

const os = require('os');

const { createProviderManager } = require('./services/providerManager');

const parseList = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const parseIntOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
};

const readContent = (opts) => {
  if (opts.contentFile) {
    const fullPath = path.resolve(process.cwd(), String(opts.contentFile));
    if (!fs.existsSync(fullPath)) {
      const err = new Error(`File not found: ${opts.contentFile}`);
      err.code = 'FILE_NOT_FOUND';
      throw err;
    }
    return fs.readFileSync(fullPath, 'utf-8');
  }
  return String(opts.content || '');
};

const createError = (code, message, hint) => {
  const err = new Error(message);
  err.code = code;
  if (hint) err.hint = hint;
  return err;
};

// Write commands that support --dry-run
const WRITE_COMMANDS = new Set(['publish', 'save-draft', 'login', 'logout']);

const runCommand = async (command, opts = {}) => {
  // --dry-run support for write commands
  if (opts.dryRun && WRITE_COMMANDS.has(command)) {
    return { dryRun: true, command, params: { ...opts, dryRun: undefined } };
  }

  if (command === 'install-skill') {
    const skillSrc = path.resolve(__dirname, '..', 'skills', 'viruagent.md');
    if (!fs.existsSync(skillSrc)) {
      throw createError('FILE_NOT_FOUND', 'Skill file not found in package');
    }

    // Detect target: Claude Code (~/.claude/commands/) or custom
    const targetDir = opts.target
      || path.join(os.homedir(), '.claude', 'commands');
    fs.mkdirSync(targetDir, { recursive: true });

    const dest = path.join(targetDir, 'viruagent.md');
    fs.copyFileSync(skillSrc, dest);
    return { installed: true, path: dest };
  }

  const manager = createProviderManager();

  if (command === 'list-providers') {
    return { providers: manager.getAvailableProviders() };
  }

  const providerName = opts.provider || 'tistory';
  let provider;
  try {
    provider = manager.getProvider(providerName);
  } catch {
    throw createError(
      'PROVIDER_NOT_FOUND',
      `Unknown provider: ${providerName}`,
      'viruagent-cli list-providers'
    );
  }

  const withProvider = (fn) => async () => {
    const result = await fn();
    return { provider: providerName, ...result };
  };

  switch (command) {
    case 'status':
    case 'auth-status':
      return withProvider(() => provider.authStatus())();

    case 'login':
      return withProvider(() =>
        provider.login({
          headless: Boolean(opts.headless),
          manual: Boolean(opts.manual),
          username: opts.username || undefined,
          password: opts.password || undefined,
          twoFactorCode: opts.twoFactorCode || undefined,
          fromChrome: Boolean(opts.fromChrome),
          profile: opts.profile || undefined,
        })
      )();

    case 'publish': {
      const content = readContent(opts);
      if (!content) {
        throw createError('MISSING_CONTENT', 'publish requires --content or --content-file', 'viruagent-cli publish --spec');
      }
      return withProvider(() =>
        provider.publish({
          title: opts.title || '',
          content,
          visibility: opts.visibility || 'public',
          category: parseIntOrNull(opts.category),
          tags: opts.tags || '',
          thumbnail: opts.thumbnail || undefined,
          relatedImageKeywords: parseList(opts.relatedImageKeywords),
          enforceSystemPrompt: opts.enforceSystemPrompt !== false,
          imageUrls: parseList(opts.imageUrls),
          imageUploadLimit: parseIntOrNull(opts.imageUploadLimit) || 1,
          minimumImageCount: parseIntOrNull(opts.minimumImageCount) || 1,
          autoUploadImages: opts.autoUploadImages !== false,
        })
      )();
    }

    case 'save-draft': {
      const content = readContent(opts);
      if (!content) {
        throw createError('MISSING_CONTENT', 'save-draft requires --content or --content-file', 'viruagent-cli save-draft --spec');
      }
      return withProvider(() =>
        provider.saveDraft({
          title: opts.title || '',
          content,
          relatedImageKeywords: parseList(opts.relatedImageKeywords),
          enforceSystemPrompt: opts.enforceSystemPrompt !== false,
          imageUrls: parseList(opts.imageUrls),
          imageUploadLimit: parseIntOrNull(opts.imageUploadLimit) || 1,
          minimumImageCount: parseIntOrNull(opts.minimumImageCount) || 1,
          autoUploadImages: opts.autoUploadImages !== false,
          tags: opts.tags || '',
          category: parseIntOrNull(opts.category),
        })
      )();
    }

    case 'list-categories':
      return withProvider(() => provider.listCategories())();

    case 'list-posts':
      return withProvider(() =>
        provider.listPosts({ limit: parseIntOrNull(opts.limit) || 20 })
      )();

    case 'read-post': {
      if (!opts.postId) {
        throw createError('INVALID_POST_ID', 'read-post requires --post-id', 'viruagent-cli read-post --spec');
      }
      return withProvider(() =>
        provider.getPost({
          postId: opts.postId,
          includeDraft: Boolean(opts.includeDraft),
        })
      )();
    }

    case 'logout':
      return withProvider(() => provider.logout())();

    default:
      throw createError('UNKNOWN_COMMAND', `Unknown command: ${command}`, 'viruagent-cli --spec');
  }
};

module.exports = { runCommand };
