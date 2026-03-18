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
      'Instagram login requires username/password. ' +
      'Please set the INSTA_USERNAME / INSTA_PASSWORD environment variables.',
    );
  }

  // Step 1: GET login page -> obtain csrftoken + mid cookies
  const initRes = await fetch('https://www.instagram.com/accounts/login/', {
    headers: { 'User-Agent': USER_AGENT },
    redirect: 'manual',
  });
  let cookies = parseCookiesFromHeaders(initRes.headers);

  const csrfCookie = cookies.find((c) => c.name === 'csrftoken');
  if (!csrfCookie) {
    throw new Error('Failed to retrieve csrftoken from the Instagram login page.');
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

  if (loginData.checkpoint_url || loginData.message === 'challenge_required') {
    // Attempt automatic challenge resolution (choice=0 = "This was me")
    const challengeRes = await fetch('https://www.instagram.com/api/v1/challenge/web/action/', {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'X-CSRFToken': csrfToken,
        'X-Requested-With': 'XMLHttpRequest',
        'X-Instagram-AJAX': '1',
        'X-IG-App-ID': IG_APP_ID,
        Referer: 'https://www.instagram.com/challenge/',
        Origin: 'https://www.instagram.com',
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookieHeader,
      },
      body: 'choice=0',
      redirect: 'manual',
    });
    const challengeData = await challengeRes.json().catch(() => ({}));
    if (challengeData.status !== 'ok') {
      throw new Error(
        'challenge_required: Automatic resolution failed. Please complete identity verification in the browser. ' +
        (loginData.checkpoint_url || ''),
      );
    }
    // Re-login after challenge resolution
    const retryRes = await fetch('https://www.instagram.com/api/v1/web/accounts/login/ajax/', {
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
    const retryCookies = parseCookiesFromHeaders(retryRes.headers);
    cookies = mergeCookies(cookies, retryCookies);
    const retryData = await retryRes.json().catch(() => ({}));
    if (retryData.authenticated) {
      saveInstaSession(sessionPath, cookies);
      return {
        provider: 'insta',
        loggedIn: true,
        userId: retryData.userId || null,
        username: resolvedUsername,
        sessionPath,
        challengeResolved: true,
      };
    }
  }

  if (loginData.two_factor_required) {
    throw new Error(
      'Two-factor authentication (2FA) is required. Please complete verification in the browser first.',
    );
  }

  if (!loginData.authenticated) {
    const reason = loginData.message || loginData.status || 'unknown';
    throw new Error(`Instagram login failed: ${reason}`);
  }

  // Save session
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
