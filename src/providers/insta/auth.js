const fs = require('fs');
const path = require('path');
const { readInstaCredentials } = require('./utils');
const { saveInstaSession } = require('./session');

const IG_APP_ID = '936619743392459';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

const parseCookiesFromHeaders = (headers) => {
  const cookies = [];
  const setCookies = headers.getSetCookie?.() || [];
  for (const raw of setCookies) {
    const parts = raw.split(';').map((s) => s.trim());
    const [nameValue, ...attrs] = parts;
    const eqIndex = nameValue.indexOf('=');
    if (eqIndex < 0) continue;

    const name = nameValue.slice(0, eqIndex);
    const value = nameValue.slice(eqIndex + 1);

    const cookie = { name, value, domain: '.instagram.com', path: '/' };
    for (const attr of attrs) {
      const lower = attr.toLowerCase();
      if (lower.startsWith('domain=')) cookie.domain = attr.slice(7);
      if (lower.startsWith('path=')) cookie.path = attr.slice(5);
      if (lower === 'httponly') cookie.httpOnly = true;
      if (lower === 'secure') cookie.secure = true;
    }
    cookies.push(cookie);
  }
  return cookies;
};

const mergeCookies = (existing, incoming) => {
  const map = new Map();
  for (const c of [...existing, ...incoming]) {
    map.set(c.name, c);
  }
  return [...map.values()];
};

const createAskForAuthentication = ({ sessionPath }) => async ({
  username,
  password,
} = {}) => {
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });

  const resolvedUsername = username || readInstaCredentials().username;
  const resolvedPassword = password || readInstaCredentials().password;

  if (!resolvedUsername || !resolvedPassword) {
    throw new Error(
      '인스타그램 로그인에 username/password가 필요합니다. ' +
      '환경변수 INSTA_USERNAME / INSTA_PASSWORD를 설정해 주세요.',
    );
  }

  // Step 1: GET login page -> csrftoken + mid 쿠키 획득
  const initRes = await fetch('https://www.instagram.com/accounts/login/', {
    headers: { 'User-Agent': USER_AGENT },
    redirect: 'manual',
  });
  let cookies = parseCookiesFromHeaders(initRes.headers);

  const csrfCookie = cookies.find((c) => c.name === 'csrftoken');
  if (!csrfCookie) {
    throw new Error('Instagram 초기 페이지에서 csrftoken을 가져올 수 없습니다.');
  }
  const csrfToken = csrfCookie.value;
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

  // Step 2: POST login
  const timestamp = Math.floor(Date.now() / 1000);
  const body = new URLSearchParams({
    username: resolvedUsername,
    enc_password: `#PWD_INSTAGRAM_BROWSER:0:${timestamp}:${resolvedPassword}`,
    queryParams: '{}',
    optIntoOneTap: 'false',
  });

  const loginRes = await fetch('https://www.instagram.com/api/v1/web/accounts/login/ajax/', {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'X-CSRFToken': csrfToken,
      'X-Requested-With': 'XMLHttpRequest',
      'X-IG-App-ID': IG_APP_ID,
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: 'https://www.instagram.com/accounts/login/',
      Origin: 'https://www.instagram.com',
      Cookie: cookieHeader,
    },
    body: body.toString(),
    redirect: 'manual',
  });

  const loginCookies = parseCookiesFromHeaders(loginRes.headers);
  cookies = mergeCookies(cookies, loginCookies);

  const loginData = await loginRes.json();

  if (loginData.checkpoint_url) {
    throw new Error(
      '2단계 인증(checkpoint)이 필요합니다. 브라우저에서 먼저 인증을 완료해 주세요.',
    );
  }

  if (loginData.two_factor_required) {
    throw new Error(
      '2단계 인증(2FA)이 필요합니다. 브라우저에서 먼저 인증을 완료해 주세요.',
    );
  }

  if (!loginData.authenticated) {
    const reason = loginData.message || loginData.status || 'unknown';
    throw new Error(`인스타그램 로그인 실패: ${reason}`);
  }

  // 세션 저장
  saveInstaSession(sessionPath, cookies);

  return {
    provider: 'insta',
    loggedIn: true,
    userId: loginData.userId || null,
    username: resolvedUsername,
    sessionPath,
  };
};

module.exports = {
  createAskForAuthentication,
  IG_APP_ID,
  USER_AGENT,
};
