const fs = require('fs');
const path = require('path');
const { saveProviderMeta } = require('../../storage/sessionStore');
const { sleep, readCredentialsFromEnv, parseSessionError, buildLoginErrorMessage } = require('./utils');
const { clickKakaoAccountContinue } = require('./browserHelpers');

const isLoggedInByCookies = async (context) => {
  const cookies = await context.cookies('https://www.tistory.com');
  return cookies.some((cookie) => {
    const name = cookie.name.toLowerCase();
    return name.includes('tistory') || name.includes('access') || name.includes('login');
  });
};

const waitForLoginFinish = async (page, context, timeoutMs = 45000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isLoggedInByCookies(context)) {
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

const persistTistorySession = async (context, targetSessionPath) => {
  const cookies = await context.cookies('https://www.tistory.com');
  const sanitized = cookies.map((cookie) => ({
    ...cookie,
    expires: Number(cookie.expires || -1),
    size: undefined,
    partitionKey: undefined,
    sourcePort: undefined,
    sourceScheme: undefined,
  }));

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
 * withProviderSession 팩토리.
 * askForAuthentication을 외부에서 주입받아 스코프 버그를 해결한다.
 */
const createWithProviderSession = (askForAuthentication) => async (fn) => {
  const credentials = readCredentialsFromEnv();
  const hasCredentials = Boolean(credentials.username && credentials.password);

  try {
    const result = await fn();
    saveProviderMeta('tistory', {
      loggedIn: true,
      lastValidatedAt: new Date().toISOString(),
    });
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
      });

      if (!loginResult.loggedIn) {
        throw new Error(loginResult.message || '세션 갱신 후 로그인 상태가 확인되지 않았습니다.');
      }

      return fn();
    } catch (reloginError) {
      saveProviderMeta('tistory', {
        loggedIn: false,
        lastError: buildLoginErrorMessage(reloginError),
        lastValidatedAt: new Date().toISOString(),
      });
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
