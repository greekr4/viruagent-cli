const fs = require('fs');
const path = require('path');
const { saveProviderMeta } = require('../../storage/sessionStore');
const { readXCredentials, parseXSessionError, buildLoginErrorMessage } = require('./utils');

const ESSENTIAL_COOKIES = ['auth_token', 'ct0'];

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

const saveXSession = (sessionPath, cookies) => {
  const existing = readSessionFile(sessionPath) || {};
  writeSessionFile(sessionPath, {
    ...existing,
    cookies,
    updatedAt: new Date().toISOString(),
  });
};

const loadXSession = (sessionPath) => {
  const raw = readSessionFile(sessionPath);
  return Array.isArray(raw?.cookies) ? raw.cookies : null;
};

// ── Rate Limit persistence ──

const loadRateLimits = (sessionPath) => {
  const raw = readSessionFile(sessionPath);
  return raw?.rateLimits || null;
};

const saveRateLimits = (sessionPath, counters) => {
  const raw = readSessionFile(sessionPath) || {};
  raw.rateLimits = {
    ...counters,
    savedAt: new Date().toISOString(),
  };
  writeSessionFile(sessionPath, raw);
};

const validateXSession = (sessionPath) => {
  const cookies = loadXSession(sessionPath);
  if (!cookies) return false;
  return ESSENTIAL_COOKIES.every((name) =>
    cookies.some((c) => c.name === name && c.value),
  );
};

const cookiesToHeader = (cookies) =>
  cookies.map((c) => `${c.name}=${c.value}`).join('; ');

const createXWithProviderSession = (setCredentials, account) => async (fn) => {
  const credentials = readXCredentials();
  const hasCredentials = Boolean(credentials.authToken && credentials.ct0);

  try {
    const result = await fn();
    saveProviderMeta('x', { loggedIn: true, lastValidatedAt: new Date().toISOString() }, account);
    return result;
  } catch (error) {
    if (!parseXSessionError(error) || !hasCredentials) {
      throw error;
    }

    try {
      const loginResult = await setCredentials({
        authToken: credentials.authToken,
        ct0: credentials.ct0,
      });

      saveProviderMeta('x', {
        loggedIn: loginResult.loggedIn,
        username: loginResult.username,
        sessionPath: loginResult.sessionPath,
        lastRefreshedAt: new Date().toISOString(),
        lastError: null,
      }, account);

      if (!loginResult.loggedIn) {
        throw new Error(loginResult.message || 'Login status could not be confirmed after session refresh.');
      }

      return fn();
    } catch (reloginError) {
      saveProviderMeta('x', {
        loggedIn: false,
        lastError: buildLoginErrorMessage(reloginError),
        lastValidatedAt: new Date().toISOString(),
      }, account);
      throw reloginError;
    }
  }
};

module.exports = {
  saveXSession,
  loadXSession,
  validateXSession,
  cookiesToHeader,
  loadRateLimits,
  saveRateLimits,
  createXWithProviderSession,
};
