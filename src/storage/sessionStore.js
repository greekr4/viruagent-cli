const fs = require('fs');
const path = require('path');
const os = require('os');

const BASE_DIR = path.join(os.homedir(), '.viruagent-cli');
const SESSION_DIR = path.join(BASE_DIR, 'sessions');
const META_FILE = path.join(BASE_DIR, 'providers.json');

const ensureDir = (target) => {
  if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
};

const normalizeProvider = (provider) => String(provider || 'tistory').toLowerCase();

const readJson = (target) => {
  if (!fs.existsSync(target)) return {};
  try {
    const raw = fs.readFileSync(target, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const writeJson = (target, data) => {
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, JSON.stringify(data, null, 2), 'utf-8');
};

const getSessionPath = (provider, account) => {
  ensureDir(SESSION_DIR);
  const base = normalizeProvider(provider);
  const suffix = account ? `-${String(account).toLowerCase().replace(/[^a-z0-9._-]/g, '_')}` : '';
  return path.join(SESSION_DIR, `${base}${suffix}-session.json`);
};

const getProvidersMeta = () => {
  ensureDir(BASE_DIR);
  return readJson(META_FILE);
};

const metaKey = (provider, account) => {
  const base = normalizeProvider(provider);
  return account ? `${base}:${String(account).toLowerCase()}` : base;
};

const saveProviderMeta = (provider, patch, account) => {
  const meta = getProvidersMeta();
  const key = metaKey(provider, account);
  meta[key] = {
    ...(meta[key] || {}),
    ...patch,
    provider: normalizeProvider(provider),
    ...(account ? { account: String(account).toLowerCase() } : {}),
    updatedAt: new Date().toISOString(),
  };
  writeJson(META_FILE, meta);
};

const getProviderMeta = (provider, account) => {
  const meta = getProvidersMeta();
  return meta[metaKey(provider, account)] || null;
};

const clearProviderMeta = (provider, account) => {
  const meta = getProvidersMeta();
  delete meta[metaKey(provider, account)];
  writeJson(META_FILE, meta);
};

module.exports = {
  getSessionPath,
  getProviderMeta,
  saveProviderMeta,
  clearProviderMeta,
};
