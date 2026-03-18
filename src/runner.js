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
    const skillsDir = path.resolve(__dirname, '..', 'skills');
    const skillFiles = ['viruagent.md', 'viruagent-tistory.md', 'viruagent-naver.md', 'viruagent-insta.md'];

    const targetDir = opts.target
      || path.join(os.homedir(), '.claude', 'commands');
    fs.mkdirSync(targetDir, { recursive: true });

    const installed = [];
    for (const file of skillFiles) {
      const src = path.join(skillsDir, file);
      if (!fs.existsSync(src)) continue;
      const dest = path.join(targetDir, file);
      fs.copyFileSync(src, dest);
      installed.push(dest);
    }

    if (installed.length === 0) {
      throw createError('FILE_NOT_FOUND', 'Skill files not found in package');
    }

    return { installed: true, paths: installed, count: installed.length };
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
        provider.listPosts({
          username: opts.username || undefined,
          limit: parseIntOrNull(opts.limit) || 20,
        })
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

    // ── Instagram-specific (works with other providers if the method exists) ──

    case 'get-profile':
      if (!opts.username) {
        throw createError('MISSING_PARAM', 'get-profile requires --username');
      }
      return withProvider(() => provider.getProfile({ username: opts.username }))();

    case 'get-feed':
      return withProvider(() => provider.getFeed())();

    case 'like':
      if (!opts.postId) {
        throw createError('MISSING_PARAM', 'like requires --post-id');
      }
      return withProvider(() => provider.like({ postId: opts.postId }))();

    case 'unlike':
      if (!opts.postId) {
        throw createError('MISSING_PARAM', 'unlike requires --post-id');
      }
      return withProvider(() => provider.unlike({ postId: opts.postId }))();

    case 'comment':
      if (!opts.postId || !opts.text) {
        throw createError('MISSING_PARAM', 'comment requires --post-id and --text');
      }
      return withProvider(() => provider.comment({ postId: opts.postId, text: opts.text }))();

    case 'follow':
      if (!opts.username) {
        throw createError('MISSING_PARAM', 'follow requires --username');
      }
      return withProvider(() => provider.follow({ username: opts.username }))();

    case 'unfollow':
      if (!opts.username) {
        throw createError('MISSING_PARAM', 'unfollow requires --username');
      }
      return withProvider(() => provider.unfollow({ username: opts.username }))();

    case 'like-comment':
      if (!opts.commentId) {
        throw createError('MISSING_PARAM', 'like-comment requires --comment-id');
      }
      return withProvider(() => provider.likeComment({ commentId: opts.commentId }))();

    case 'unlike-comment':
      if (!opts.commentId) {
        throw createError('MISSING_PARAM', 'unlike-comment requires --comment-id');
      }
      return withProvider(() => provider.unlikeComment({ commentId: opts.commentId }))();

    case 'analyze-post':
      if (!opts.postId) {
        throw createError('MISSING_PARAM', 'analyze-post requires --post-id');
      }
      return withProvider(() => provider.analyzePost({ postId: opts.postId }))();

    case 'resolve-challenge':
      return withProvider(() => provider.resolveChallenge())();

    case 'rate-limit-status':
      return withProvider(() => Promise.resolve(provider.rateLimitStatus()))();

    default:
      throw createError('UNKNOWN_COMMAND', `Unknown command: ${command}`, 'viruagent-cli --spec');
  }
};

module.exports = { runCommand };
