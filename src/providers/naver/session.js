const fs = require('fs');
const path = require('path');
const { saveProviderMeta } = require('../../storage/sessionStore');
const { readNaverCredentials, parseNaverSessionError, buildLoginErrorMessage } = require('./utils');
const { extractAllCookies, filterCookies, cookiesToSessionFormat } = require('../chromeManager');

const NAVER_COOKIE_DOMAINS = ['https://www.naver.com', 'https://nid.naver.com', 'https://blog.naver.com'];

const isLoggedInByCookies = async (context, page) => {
  try {
    const all = await extractAllCookies(context, page);
    return all.some((c) => c.domain.includes('naver.com') && (c.name === 'NID_AUT' || c.name === 'NID_SES'));
  } catch {
    for (const domain of NAVER_COOKIE_DOMAINS) {
      const cookies = await context.cookies(domain);
      const hasAuth = cookies.some((c) => c.name === 'NID_AUT' || c.name === 'NID_SES');
      if (hasAuth) return true;
    }
    return false;
  }
};

const persistNaverSession = async (context, page, targetSessionPath) => {
  // Use CDP Network.getAllCookies to capture httpOnly cookies (e.g. NID_AUT)
  const all = await extractAllCookies(context, page);
  const naverCookies = filterCookies(all, ['naver.com']);

  // Deduplicate by name+domain
  const seen = new Set();
  const unique = naverCookies.filter((c) => {
    const key = `${c.name}@${c.domain}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const sanitized = cookiesToSessionFormat(unique);

  const payload = {
    cookies: sanitized,
    updatedAt: new Date().toISOString(),
  };
  await fs.promises.mkdir(path.dirname(targetSessionPath), { recursive: true });
  await fs.promises.writeFile(targetSessionPath, JSON.stringify(payload, null, 2), 'utf-8');
};

const validateNaverSession = async (sessionPath) => {
  if (!fs.existsSync(sessionPath)) return false;

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
  } catch {
    return false;
  }

  const cookies = Array.isArray(raw?.cookies) ? raw.cookies : [];
  return cookies.some((c) => c.name === 'NID_AUT' && c.value) &&
    cookies.some((c) => c.name === 'NID_SES' && c.value);
};

const createNaverWithProviderSession = (askForAuthentication, account) => async (fn) => {
  const credentials = readNaverCredentials();
  const hasCredentials = Boolean(credentials.username && credentials.password);

  try {
    const result = await fn();
    saveProviderMeta('naver', { loggedIn: true, lastValidatedAt: new Date().toISOString() }, account);
    return result;
  } catch (error) {
    if (!parseNaverSessionError(error) || !hasCredentials) {
      throw error;
    }

    try {
      const loginResult = await askForAuthentication({
        headless: false,
        manual: false,
        username: credentials.username,
        password: credentials.password,
      });

      saveProviderMeta('naver', {
        loggedIn: loginResult.loggedIn,
        blogId: loginResult.blogId,
        blogUrl: loginResult.blogUrl,
        sessionPath: loginResult.sessionPath,
        lastRefreshedAt: new Date().toISOString(),
        lastError: null,
      }, account);

      if (!loginResult.loggedIn) {
        throw new Error(loginResult.message || 'Login status could not be verified after session refresh.');
      }

      return fn();
    } catch (reloginError) {
      saveProviderMeta('naver', {
        loggedIn: false,
        lastError: buildLoginErrorMessage(reloginError),
        lastValidatedAt: new Date().toISOString(),
      }, account);
      throw reloginError;
    }
  }
};

module.exports = {
  isLoggedInByCookies,
  persistNaverSession,
  validateNaverSession,
  createNaverWithProviderSession,
};
