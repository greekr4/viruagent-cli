const fs = require('fs');
const path = require('path');
const { saveProviderMeta } = require('../../storage/sessionStore');
const { readRedditCredentials, parseRedditSessionError, buildLoginErrorMessage } = require('./utils');

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

const saveRedditSession = (sessionPath, tokenData) => {
  const existing = readSessionFile(sessionPath) || {};
  const sessionData = {
    ...existing,
    authMode: tokenData.authMode || existing.authMode || 'oauth',
    username: tokenData.username,
    updatedAt: new Date().toISOString(),
  };

  if (tokenData.authMode === 'browser') {
    sessionData.cookies = tokenData.cookies || [];
    // Clean up other auth fields
    delete sessionData.accessToken;
    delete sessionData.expiresAt;
    delete sessionData.redditSession;
    delete sessionData.modhash;
  } else if (tokenData.authMode === 'cookie') {
    sessionData.redditSession = tokenData.redditSession;
    sessionData.modhash = tokenData.modhash;
    delete sessionData.accessToken;
    delete sessionData.expiresAt;
    delete sessionData.cookies;
  } else {
    sessionData.accessToken = tokenData.accessToken;
    sessionData.expiresAt = tokenData.expiresAt;
    delete sessionData.cookies;
  }

  writeSessionFile(sessionPath, sessionData);
};

const loadRedditSession = (sessionPath) => {
  const raw = readSessionFile(sessionPath);
  if (!raw) return null;

  if (raw.authMode === 'browser') {
    if (!raw.cookies || raw.cookies.length === 0) return null;
    return {
      authMode: 'browser',
      cookies: raw.cookies,
      username: raw.username,
    };
  }

  if (raw.authMode === 'cookie') {
    if (!raw.redditSession) return null;
    return {
      authMode: 'cookie',
      redditSession: raw.redditSession,
      modhash: raw.modhash || '',
      username: raw.username,
    };
  }

  // OAuth mode
  if (!raw.accessToken) return null;
  return {
    authMode: 'oauth',
    accessToken: raw.accessToken,
    expiresAt: raw.expiresAt,
    username: raw.username,
  };
};

const cookiesToHeader = (cookies) =>
  cookies.map((c) => `${c.name}=${c.value}`).join('; ');

const isTokenExpired = (sessionPath) => {
  const session = loadRedditSession(sessionPath);
  if (!session) return true;
  // Browser and cookie sessions don't expire via token
  if (session.authMode === 'cookie' || session.authMode === 'browser') return false;
  if (!session.expiresAt) return true;
  // Consider expired 60 seconds before actual expiry
  return Date.now() >= session.expiresAt - 60000;
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

const validateRedditSession = (sessionPath) => {
  const session = loadRedditSession(sessionPath);
  if (!session) return false;
  if (session.authMode === 'browser') return session.cookies?.length > 0;
  if (session.authMode === 'cookie') return Boolean(session.redditSession);
  if (!session.accessToken) return false;
  return !isTokenExpired(sessionPath);
};

const createRedditWithProviderSession = (loginFn, account) => async (fn) => {
  const credentials = readRedditCredentials();
  const hasCredentials = Boolean(
    (credentials.clientId && credentials.clientSecret && credentials.username && credentials.password) ||
    (credentials.username && credentials.password),
  );

  try {
    const result = await fn();
    saveProviderMeta('reddit', { loggedIn: true, lastValidatedAt: new Date().toISOString() }, account);
    return result;
  } catch (error) {
    if (!parseRedditSessionError(error) || !hasCredentials) {
      throw error;
    }

    try {
      const loginResult = await loginFn(credentials);

      saveProviderMeta('reddit', {
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
      saveProviderMeta('reddit', {
        loggedIn: false,
        lastError: buildLoginErrorMessage(reloginError),
        lastValidatedAt: new Date().toISOString(),
      }, account);
      throw reloginError;
    }
  }
};

module.exports = {
  saveRedditSession,
  loadRedditSession,
  isTokenExpired,
  cookiesToHeader,
  loadRateLimits,
  saveRateLimits,
  validateRedditSession,
  createRedditWithProviderSession,
};
