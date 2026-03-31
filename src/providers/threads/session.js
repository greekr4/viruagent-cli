const fs = require('fs');
const path = require('path');
const { saveProviderMeta } = require('../../storage/sessionStore');
const { readThreadsCredentials, parseThreadsSessionError, buildLoginErrorMessage } = require('./utils');

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

const saveThreadsSession = (sessionPath, { token, userId, deviceId }) => {
  const existing = readSessionFile(sessionPath) || {};
  writeSessionFile(sessionPath, {
    ...existing,
    token,
    userId,
    deviceId,
    updatedAt: new Date().toISOString(),
  });
};

const loadThreadsSession = (sessionPath) => {
  const raw = readSessionFile(sessionPath);
  if (!raw?.token) return null;
  return { token: raw.token, userId: raw.userId, deviceId: raw.deviceId };
};

const validateThreadsSession = (sessionPath) => {
  const session = loadThreadsSession(sessionPath);
  return Boolean(session?.token && session?.userId);
};

// ── Rate Limit persistence (per userId) ──

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

const createThreadsWithProviderSession = (askForAuthentication, account) => async (fn) => {
  const credentials = readThreadsCredentials();
  const hasCredentials = Boolean(credentials.username && credentials.password);

  try {
    const result = await fn();
    saveProviderMeta('threads', { loggedIn: true, lastValidatedAt: new Date().toISOString() }, account);
    return result;
  } catch (error) {
    if (!parseThreadsSessionError(error) || !hasCredentials) {
      throw error;
    }

    try {
      const loginResult = await askForAuthentication({
        username: credentials.username,
        password: credentials.password,
      });

      saveProviderMeta('threads', {
        loggedIn: loginResult.loggedIn,
        userId: loginResult.userId,
        sessionPath: loginResult.sessionPath,
        lastRefreshedAt: new Date().toISOString(),
        lastError: null,
      }, account);

      if (!loginResult.loggedIn) {
        throw new Error(loginResult.message || 'Login status could not be confirmed after session refresh.');
      }

      return fn();
    } catch (reloginError) {
      saveProviderMeta('threads', {
        loggedIn: false,
        lastError: buildLoginErrorMessage(reloginError),
        lastValidatedAt: new Date().toISOString(),
      }, account);
      throw reloginError;
    }
  }
};

module.exports = {
  saveThreadsSession,
  loadThreadsSession,
  validateThreadsSession,
  loadRateLimits,
  saveRateLimits,
  createThreadsWithProviderSession,
};
