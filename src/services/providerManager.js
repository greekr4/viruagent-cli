const path = require('path');
const { getSessionPath } = require('../storage/sessionStore');
const createTistoryProvider = require('../providers/tistoryProvider');
const createNaverProvider = require('../providers/naverProvider');

const providerFactory = {
  tistory: createTistoryProvider,
  naver: createNaverProvider,
};

const providers = ['tistory', 'naver'];

const createProviderManager = () => {
  const cache = new Map();

  const getProvider = (provider = 'tistory') => {
    const normalized = String(provider || 'tistory').toLowerCase();
    if (!providerFactory[normalized]) {
      throw new Error(`지원하지 않는 provider입니다: ${provider}. 가능한 값: ${providers.join(', ')}`);
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

  const getAvailableProviders = () => providers.map((provider) => ({
    id: provider,
    name: provider === 'tistory' ? 'Tistory' : 'Naver Blog',
  }));

  return { getProvider, getAvailableProviders };
};

module.exports = { createProviderManager };
