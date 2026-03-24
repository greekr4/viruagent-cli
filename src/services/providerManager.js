const path = require('path');
const { getSessionPath } = require('../storage/sessionStore');
const createTistoryProvider = require('../providers/tistory');
const createNaverProvider = require('../providers/naver');
const createInstaProvider = require('../providers/insta');
const createXProvider = require('../providers/x');

const providerFactory = {
  tistory: createTistoryProvider,
  naver: createNaverProvider,
  insta: createInstaProvider,
  x: createXProvider,
};

const providers = ['tistory', 'naver', 'insta', 'x'];

const createProviderManager = () => {
  const cache = new Map();

  const getProvider = (provider = 'tistory', account) => {
    const normalized = String(provider || 'tistory').toLowerCase();
    if (!providerFactory[normalized]) {
      throw new Error(`Unsupported provider: ${provider}. Available options: ${providers.join(', ')}`);
    }

    const cacheKey = account ? `${normalized}:${String(account).toLowerCase()}` : normalized;
    if (!cache.has(cacheKey)) {
      const sessionPath = getSessionPath(normalized, account);
      const options = {
        provider: normalized,
        sessionPath,
        account: account || undefined,
      };
      const providerInstance = providerFactory[normalized](options);
      cache.set(cacheKey, providerInstance);
    }

    return cache.get(cacheKey);
  };

  const providerNames = { tistory: 'Tistory', naver: 'Naver Blog', insta: 'Instagram', x: 'X (Twitter)' };
  const getAvailableProviders = () => providers.map((provider) => ({
    id: provider,
    name: providerNames[provider] || provider,
  }));

  return { getProvider, getAvailableProviders };
};

module.exports = { createProviderManager };
