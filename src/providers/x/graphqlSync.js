const fs = require('fs');
const path = require('path');

const CACHE_TTL_MS = 3600000; // 1 hour

const X_BASE_URL = 'https://x.com';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

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

const fetchMainJsUrl = async () => {
  const res = await fetch(X_BASE_URL, {
    headers: { 'User-Agent': USER_AGENT },
    redirect: 'follow',
  });
  const html = await res.text();
  const match = html.match(/main\.[a-f0-9]+\.js/);
  if (!match) throw new Error('Failed to find main.js URL from x.com');
  return `https://abs.twimg.com/responsive-web/client-web/${match[0]}`;
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

  // Fetch and parse from x.com
  const mainJsUrl = await fetchMainJsUrl();
  const res = await fetch(mainJsUrl, {
    headers: { 'User-Agent': USER_AGENT },
  });
  const jsContent = await res.text();
  const operations = parseOperations(jsContent);

  if (operations.size === 0) {
    throw new Error('Failed to parse any GraphQL operations from main.js');
  }

  // Cache
  memoryCache = operations;
  memoryCacheTime = Date.now();

  const cacheObj = {
    syncedAt: Date.now(),
    mainJsUrl,
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
  syncGraphqlOperations,
  getOperation,
  invalidateCache,
};
