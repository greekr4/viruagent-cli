const fs = require('fs');
const path = require('path');
const { saveProviderMeta } = require('../../storage/sessionStore');
const { readInstaCredentials, parseInstaSessionError, buildLoginErrorMessage } = require('./utils');

const ESSENTIAL_COOKIES = ['sessionid', 'csrftoken', 'ds_user_id'];

const readSessionFile = (sessionPath) => {
  if (!fs.existsSync(sessionPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
  } catch {
    return null;
  }
};

const writeSessionFile = (sessionPath, data) => {
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  fs.writeFileSync(sessionPath, JSON.stringify(data, null, 2), 'utf-8');
};

const saveInstaSession = (sessionPath, cookies) => {
  const existing = readSessionFile(sessionPath) || {};
  writeSessionFile(sessionPath, {
    ...existing,
    cookies,
    updatedAt: new Date().toISOString(),
  });
};

const loadInstaSession = (sessionPath) => {
  const raw = readSessionFile(sessionPath);
  return Array.isArray(raw?.cookies) ? raw.cookies : null;
};

// ── Rate Limit 영속화 (userId별) ──

const loadRateLimits = (sessionPath, userId) => {
  const raw = readSessionFile(sessionPath);
  return raw?.rateLimits?.[userId] || null;
};

const saveRateLimits = (sessionPath, userId, counters) => {
  const raw = readSessionFile(sessionPath) || {};
  if (!raw.rateLimits) raw.rateLimits = {};
  raw.rateLimits[userId] = {
    ...counters,
    savedAt: new Date().toISOString(),
  };
  writeSessionFile(sessionPath, raw);
};

const validateInstaSession = (sessionPath) => {
  const cookies = loadInstaSession(sessionPath);
  if (!cookies) return false;
  return ESSENTIAL_COOKIES.every((name) =>
    cookies.some((c) => c.name === name && c.value),
  );
};

const cookiesToHeader = (cookies) =>
  cookies.map((c) => `${c.name}=${c.value}`).join('; ');

const createInstaWithProviderSession = (askForAuthentication) => async (fn) => {
  const credentials = readInstaCredentials();
  const hasCredentials = Boolean(credentials.username && credentials.password);

  try {
    const result = await fn();
    saveProviderMeta('insta', {
      loggedIn: true,
      lastValidatedAt: new Date().toISOString(),
    });
    return result;
  } catch (error) {
    if (!parseInstaSessionError(error) || !hasCredentials) {
      throw error;
    }

    try {
      const loginResult = await askForAuthentication({
        username: credentials.username,
        password: credentials.password,
      });

      saveProviderMeta('insta', {
        loggedIn: loginResult.loggedIn,
        userId: loginResult.userId,
        sessionPath: loginResult.sessionPath,
        lastRefreshedAt: new Date().toISOString(),
        lastError: null,
      });

      if (!loginResult.loggedIn) {
        throw new Error(loginResult.message || '세션 갱신 후 로그인 상태가 확인되지 않았습니다.');
      }

      return fn();
    } catch (reloginError) {
      saveProviderMeta('insta', {
        loggedIn: false,
        lastError: buildLoginErrorMessage(reloginError),
        lastValidatedAt: new Date().toISOString(),
      });
      throw reloginError;
    }
  }
};

module.exports = {
  saveInstaSession,
  loadInstaSession,
  validateInstaSession,
  cookiesToHeader,
  loadRateLimits,
  saveRateLimits,
  createInstaWithProviderSession,
};
