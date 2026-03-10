const fs = require('fs');
const path = require('path');
const { saveProviderMeta } = require('../../storage/sessionStore');
const { readNaverCredentials, parseNaverSessionError, buildLoginErrorMessage } = require('./utils');

const NAVER_COOKIE_DOMAINS = ['https://www.naver.com', 'https://nid.naver.com', 'https://blog.naver.com'];

const isLoggedInByCookies = async (context) => {
  for (const domain of NAVER_COOKIE_DOMAINS) {
    const cookies = await context.cookies(domain);
    const hasAuth = cookies.some((c) => c.name === 'NID_AUT' || c.name === 'NID_SES');
    if (hasAuth) return true;
  }
  return false;
};

const persistNaverSession = async (context, targetSessionPath) => {
  const allCookies = [];
  for (const domain of NAVER_COOKIE_DOMAINS) {
    const cookies = await context.cookies(domain);
    allCookies.push(...cookies);
  }

  // 중복 제거 (name+domain 기준)
  const seen = new Set();
  const unique = allCookies.filter((c) => {
    const key = `${c.name}@${c.domain}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const sanitized = unique.map((cookie) => ({
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

const createNaverWithProviderSession = (askForAuthentication) => async (fn) => {
  const credentials = readNaverCredentials();
  const hasCredentials = Boolean(credentials.username && credentials.password);

  try {
    const result = await fn();
    saveProviderMeta('naver', {
      loggedIn: true,
      lastValidatedAt: new Date().toISOString(),
    });
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
      });

      if (!loginResult.loggedIn) {
        throw new Error(loginResult.message || '세션 갱신 후 로그인 상태가 확인되지 않았습니다.');
      }

      return fn();
    } catch (reloginError) {
      saveProviderMeta('naver', {
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
  persistNaverSession,
  validateNaverSession,
  createNaverWithProviderSession,
};
