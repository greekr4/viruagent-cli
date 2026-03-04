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

const getSessionPath = (provider) => {
  ensureDir(SESSION_DIR);
  return path.join(SESSION_DIR, `${normalizeProvider(provider)}-session.json`);
};

const getProvidersMeta = () => {
  ensureDir(BASE_DIR);
  return readJson(META_FILE);
};

const saveProviderMeta = (provider, patch) => {
  const meta = getProvidersMeta();
  meta[normalizeProvider(provider)] = {
    ...(meta[normalizeProvider(provider)] || {}),
    ...patch,
    provider: normalizeProvider(provider),
    updatedAt: new Date().toISOString(),
  };
  writeJson(META_FILE, meta);
};

const getProviderMeta = (provider) => {
  const meta = getProvidersMeta();
  return meta[normalizeProvider(provider)] || null;
};

const clearProviderMeta = (provider) => {
  const meta = getProvidersMeta();
  delete meta[normalizeProvider(provider)];
  writeJson(META_FILE, meta);
};

module.exports = {
  getSessionPath,
  getProviderMeta,
  saveProviderMeta,
  clearProviderMeta,
};
