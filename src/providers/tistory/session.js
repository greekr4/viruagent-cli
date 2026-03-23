const fs = require('fs');
const path = require('path');
const { saveProviderMeta } = require('../../storage/sessionStore');
const { sleep, readCredentialsFromEnv, parseSessionError, buildLoginErrorMessage } = require('./utils');
const { clickKakaoAccountContinue } = require('./browserHelpers');
const { extractAllCookies, filterCookies, cookiesToSessionFormat } = require('../chromeManager');

const isLoggedInByCookies = async (context, page) => {
  try {
    // Use CDP to get all cookies including httpOnly (TSSESSION)
    const all = await extractAllCookies(context, page);
    return all.some((c) => c.domain.includes('tistory') && c.name === 'TSSESSION');
  } catch {
    // Fallback to context.cookies if CDP fails
    const cookies = await context.cookies('https://www.tistory.com');
    return cookies.some((cookie) => {
      const name = cookie.name.toLowerCase();
      return name.includes('tistory') || name.includes('access') || name.includes('login');
    });
  }
};

const waitForLoginFinish = async (page, context, timeoutMs = 45000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isLoggedInByCookies(context, page)) {
      return true;
    }

    if (await clickKakaoAccountContinue(page)) {
      continue;
    }

    const url = page.url();
    if (!url.includes('/auth/login') && !url.includes('accounts.kakao.com/login') && !url.includes('kauth.kakao.com')) {
      return true;
    }

    await sleep(1000);
  }
  return false;
};

const persistTistorySession = async (context, page, targetSessionPath) => {
  // Use CDP Network.getAllCookies to capture httpOnly cookies (e.g. TSSESSION)
  const all = await extractAllCookies(context, page);
  const tistoryCookies = filterCookies(all, ['tistory.com']);
  const sanitized = cookiesToSessionFormat(tistoryCookies);

  const payload = {
    cookies: sanitized,
    updatedAt: new Date().toISOString(),
  };
  await fs.promises.mkdir(path.dirname(targetSessionPath), { recursive: true });
  await fs.promises.writeFile(
    targetSessionPath,
    JSON.stringify(payload, null, 2),
    'utf-8'
  );
};

/**
 * withProviderSession factory.
 * Receives askForAuthentication via dependency injection to avoid scope issues.
 */
const createWithProviderSession = (askForAuthentication, account) => async (fn) => {
  const credentials = readCredentialsFromEnv();
  const hasCredentials = Boolean(credentials.username && credentials.password);

  try {
    const result = await fn();
    saveProviderMeta('tistory', { loggedIn: true, lastValidatedAt: new Date().toISOString() }, account);
    return result;
  } catch (error) {
    if (!parseSessionError(error) || !hasCredentials) {
      throw error;
    }

    try {
      const loginResult = await askForAuthentication({
        headless: false,
        manual: false,
        username: credentials.username,
        password: credentials.password,
      });

      saveProviderMeta('tistory', {
        loggedIn: loginResult.loggedIn,
        blogName: loginResult.blogName,
        blogUrl: loginResult.blogUrl,
        sessionPath: loginResult.sessionPath,
        lastRefreshedAt: new Date().toISOString(),
        lastError: null,
      }, account);

      if (!loginResult.loggedIn) {
        throw new Error(loginResult.message || 'Login status could not be confirmed after session refresh.');
      }

      return fn();
    } catch (reloginError) {
      saveProviderMeta('tistory', {
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
  waitForLoginFinish,
  persistTistorySession,
  createWithProviderSession,
};
