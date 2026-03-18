const path = require('path');
const { getSessionPath } = require('../storage/sessionStore');
const createTistoryProvider = require('../providers/tistory');
const createNaverProvider = require('../providers/naver');
const createInstaProvider = require('../providers/insta');

const providerFactory = {
  tistory: createTistoryProvider,
  naver: createNaverProvider,
  insta: createInstaProvider,
};

const providers = ['tistory', 'naver', 'insta'];

const createProviderManager = () => {
  const cache = new Map();

  const getProvider = (provider = 'tistory') => {
    const normalized = String(provider || 'tistory').toLowerCase();
    if (!providerFactory[normalized]) {
      throw new Error(`Unsupported provider: ${provider}. Available options: ${providers.join(', ')}`);
    }

    if (!cache.has(normalized)) {
      const sessionPath = getSessionPath(normalized);
      const options = {
        provider: normalized,
        sessionPath,
      };
      const providerInstance = providerFactory[normalized](options);
      cache.set(normalized, providerInstance);
    }

    return cache.get(normalized);
  };

  const providerNames = { tistory: 'Tistory', naver: 'Naver Blog', insta: 'Instagram' };
  const getAvailableProviders = () => providers.map((provider) => ({
    id: provider,
    name: providerNames[provider] || provider,
  }));

  return { getProvider, getAvailableProviders };
};

module.exports = { createProviderManager };
