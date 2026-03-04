const fs = require('fs');
const path = require('path');

const { createProviderManager } = require('./services/providerManager');

const parseList = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const parseBool = (flags, key, fallback = false) => {
  if (!Object.prototype.hasOwnProperty.call(flags, key)) {
    return fallback;
  }
  const value = flags[key];
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value || '').toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const parseIntOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
};

const readContent = (flags) => {
  if (flags.contentFile) {
    const fullPath = path.resolve(process.cwd(), String(flags.contentFile));
    return fs.readFileSync(fullPath, 'utf-8');
  }
  return String(flags.content || '');
};

const pickProvider = (flags) => {
  const rawProvider = flags.provider || 'tistory';
  return String(rawProvider || 'tistory');
};

const runCommand = async (command, flags, positionals) => {
  const manager = createProviderManager();

  if (command === 'list-providers') {
    return {
      providers: manager.getAvailableProviders(),
    };
  }

  const provider = manager.getProvider(pickProvider(flags));
  const providerName = flags.provider || 'tistory';

  const withProvider = (fn) => async (payload = {}) => {
    const result = await fn(payload);
    return {
      provider: providerName,
      ...result,
    };
  };

  switch (command) {
    case 'status':
    case 'auth-status':
      return withProvider(() => provider.authStatus())();
    case 'login': {
      const result = await withProvider(() =>
        provider.login({
          headless: parseBool(flags, 'headless', false),
          manual: parseBool(flags, 'manual', false),
          username: flags.username || undefined,
          password: flags.password || undefined,
          twoFactorCode: flags.twoFactorCode || undefined,
        })
      )();
      return result;
    }
    case 'publish': {
      const content = readContent(flags);
      if (!content) {
        throw new Error('publish는 --content 또는 --content-file가 필요합니다.');
      }
      return withProvider(() =>
        provider.publish({
          title: flags.title || '',
          content,
          visibility: flags.visibility || 'public',
          category: parseIntOrNull(flags.category),
          tags: flags.tags || '',
          thumbnail: flags.thumbnail || undefined,
          relatedImageKeywords: parseList(flags.relatedImageKeywords),
          enforceSystemPrompt: parseBool(flags, 'enforceSystemPrompt', true),
          imageUrls: parseList(flags.imageUrls),
          imageUploadLimit: parseIntOrNull(flags.imageUploadLimit) || 1,
          minimumImageCount: parseIntOrNull(flags.minimumImageCount) || 1,
          autoUploadImages: parseBool(flags, 'autoUploadImages', true),
        })
      )();
    }
    case 'save-draft': {
      const content = readContent(flags);
      if (!content) {
        throw new Error('save-draft는 --content 또는 --content-file가 필요합니다.');
      }
      return withProvider(() =>
        provider.saveDraft({
          title: flags.title || '',
          content,
          relatedImageKeywords: parseList(flags.relatedImageKeywords),
          enforceSystemPrompt: parseBool(flags, 'enforceSystemPrompt', true),
          imageUrls: parseList(flags.imageUrls),
          imageUploadLimit: parseIntOrNull(flags.imageUploadLimit) || 1,
          minimumImageCount: parseIntOrNull(flags.minimumImageCount) || 1,
          autoUploadImages: parseBool(flags, 'autoUploadImages', true),
          tags: flags.tags || '',
          category: parseIntOrNull(flags.category),
        })
      )();
    }
    case 'list-categories':
      return withProvider(() => provider.listCategories())();
    case 'list-posts':
      return withProvider(() => provider.listPosts({
        limit: parseIntOrNull(flags.limit) || 20,
      }))();
    case 'read-post':
      if (!flags.postId && positionals[0]) {
        flags.postId = positionals[0];
      }
      if (!flags.postId) {
        throw new Error('read-post는 --post-id 또는 두 번째 인자가 필요합니다.');
      }
      return withProvider(() => provider.getPost({
        postId: flags.postId,
        includeDraft: parseBool(flags, 'includeDraft', false),
      }))();
    case 'logout':
      return withProvider(() => provider.logout())();
    default:
      throw new Error(`알 수 없는 명령: ${command}`);
  }
};

const run = async (command, flags, positionals, print) => {
  const commandName = command || 'status';
  const result = await runCommand(commandName, flags, positionals);
  print(JSON.stringify(result, null, 2));
};

module.exports = {
  run,
};
