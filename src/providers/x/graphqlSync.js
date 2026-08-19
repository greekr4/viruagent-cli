const fs = require('fs');
const path = require('path');
const { USER_AGENT } = require('./auth');

const CACHE_TTL_MS = 3600000; // 1 hour

const X_BASE_URL = 'https://x.com';
const X_HOME_URL = X_BASE_URL + '/home';
const X_ASSET_BASE_URL = 'https://abs.twimg.com';
// ponytail: community-registry fallback; use browser network capture if it lags X.
const GRAPHQL_REGISTRY_URL = 'https://raw.githubusercontent.com/fa0311/twitter-openapi/main/src/config/placeholder.json';
// ponytail: HTML regex scan; switch to a browser/runtime manifest if X stops listing bundles here.
const CLIENT_WEB_JS_URL_PATTERN = /(?:https?:)?\/\/abs\.twimg\.com\/responsive-web\/client-web\/[^"'<>\s]+\.js(?:\?[^"'<>\s]*)?|\/responsive-web\/client-web\/[^"'<>\s]+\.js(?:\?[^"'<>\s]*)?/g;

let memoryCache = null;
let memoryCacheTime = 0;

const getCachePath = () => {
  const dir = path.join(require('os').homedir(), '.viruagent-cli');
  return path.join(dir, 'x-graphql-cache.json');
};

const loadFileCache = () => {
  const cachePath = getCachePath();
  if (!fs.existsSync(cachePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    if (Date.now() - raw.syncedAt > CACHE_TTL_MS) return null;
    return raw;
  } catch {
    return null;
  }
};

const saveFileCache = (data) => {
  const cachePath = getCachePath();
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), 'utf-8');
};

const extractClientWebJsUrls = (html) => {
  const matches = html.match(CLIENT_WEB_JS_URL_PATTERN) || [];
  return [...new Set(matches.map((url) => new URL(url, X_ASSET_BASE_URL).href))];
};

const fetchClientWebJsUrls = async () => {
  const res = await fetch(X_HOME_URL, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
  });

  if (!res.ok) {
    throw new Error('Failed to fetch X home. status=' + res.status + ', finalUrl=' + res.url);
  }

  const html = await res.text();
  const urls = extractClientWebJsUrls(html);
  if (urls.length === 0) {
    throw new Error('Failed to find X client-web JS bundles. status=' + res.status + ', finalUrl=' + res.url);
  }
  return urls;
};

const parseOperations = (jsContent) => {
  const operations = new Map();

  // Pattern: queryId:"...",operationName:"...",operationType:"...",metadata:{featureSwitches:[...],fieldToggles:[...]}
  const regex = /queryId:"([^"]+)",operationName:"([^"]+)",operationType:"([^"]+)",metadata:\{featureSwitches:\[([^\]]*)\],fieldToggles:\[([^\]]*)\]\}/g;
  let match;
  while ((match = regex.exec(jsContent)) !== null) {
    const [, queryId, operationName, operationType, featureSwitchesRaw, fieldTogglesRaw] = match;

    const parseStringArray = (raw) =>
      raw ? raw.match(/"([^"]+)"/g)?.map((s) => s.slice(1, -1)) || [] : [];

    operations.set(operationName, {
      queryId,
      operationType,
      featureSwitches: parseStringArray(featureSwitchesRaw),
      fieldToggles: parseStringArray(fieldTogglesRaw),
    });
  }

  return operations;
};

const fetchFallbackOperation = async (operationName) => {
  try {
    const res = await fetch(GRAPHQL_REGISTRY_URL, {
      headers: { Accept: 'application/json' },
      redirect: 'follow',
    });
    if (!res.ok) return null;

    const operation = (await res.json())?.[operationName];
    if (!operation?.queryId) return null;

    return {
      queryId: operation.queryId,
      operationType: 'query',
      featureSwitches: Object.entries(operation.features || {})
        .filter(([, enabled]) => enabled)
        .map(([name]) => name),
      fieldToggles: Object.entries(operation.fieldToggles || {})
        .filter(([, enabled]) => enabled)
        .map(([name]) => name),
    };
  } catch {
    return null;
  }
};

const syncGraphqlOperations = async ({ force = false } = {}) => {
  // Check memory cache
  if (!force && memoryCache && Date.now() - memoryCacheTime < CACHE_TTL_MS) {
    return memoryCache;
  }

  // Check file cache
  if (!force) {
    const fileCache = loadFileCache();
    if (fileCache?.operations) {
      memoryCache = new Map(Object.entries(fileCache.operations));
      memoryCacheTime = fileCache.syncedAt;
      return memoryCache;
    }
  }

  // Fetch and parse from X home bundles
  const bundleUrls = await fetchClientWebJsUrls();
  const jsContents = await Promise.all(bundleUrls.map(async (url) => {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        redirect: 'follow',
      });
      return res.ok ? res.text() : '';
    } catch {
      return '';
    }
  }));

  const operations = new Map();
  for (const jsContent of jsContents) {
    for (const [operationName, operation] of parseOperations(jsContent)) {
      operations.set(operationName, operation);
    }
  }

  // HomeLatestTimeline is lazy-loaded and may be absent from x.com/home HTML.
  if (!operations.has('HomeLatestTimeline')) {
    const fallback = await fetchFallbackOperation('HomeLatestTimeline');
    if (fallback) operations.set('HomeLatestTimeline', fallback);
  }

  if (operations.size === 0) {
    throw new Error('Failed to parse any GraphQL operations from X client-web bundles');
  }

  // Cache
  memoryCache = operations;
  memoryCacheTime = Date.now();

  const cacheObj = {
    syncedAt: Date.now(),
    mainJsUrl: bundleUrls.find((url) => /\/main\.[a-zA-Z0-9]+\.js(?:\?|$)/.test(url)) || bundleUrls[0],
    bundleUrls,
    operationCount: operations.size,
    operations: Object.fromEntries(operations),
  };
  saveFileCache(cacheObj);

  return operations;
};

const getOperation = async (operationName) => {
  let ops = await syncGraphqlOperations();
  let op = ops.get(operationName);

  // If not found, force re-sync (queryId may have changed)
  if (!op) {
    ops = await syncGraphqlOperations({ force: true });
    op = ops.get(operationName);
  }

  if (!op) {
    op = await fetchFallbackOperation(operationName);
    if (op) {
      ops.set(operationName, op);
      memoryCache = ops;
    }
  }

  if (!op) {
    throw new Error(`GraphQL operation not found: ${operationName}`);
  }

  return op;
};

const invalidateCache = () => {
  memoryCache = null;
  memoryCacheTime = 0;
  const cachePath = getCachePath();
  if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
};

module.exports = {
  extractClientWebJsUrls,
  syncGraphqlOperations,
  getOperation,
  invalidateCache,
};
