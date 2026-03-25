const fs = require('fs');
const path = require('path');
const os = require('os');
const { readRedditCredentials } = require('./utils');
const { saveRedditSession } = require('./session');

const REDDIT_STATE_DIR = path.join(os.homedir(), '.viruagent-cli', 'reddit-browser-state');

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const USER_AGENT_TEMPLATE = 'viruagent-cli/0.8.0 (by /u/USERNAME)';

const buildUserAgent = (username) =>
  USER_AGENT_TEMPLATE.replace('USERNAME', username || 'unknown');

// ── OAuth2 Password Grant Login ──

const loginOAuth = async ({ sessionPath, clientId, clientSecret, username, password }) => {
  const userAgent = buildUserAgent(username);
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'User-Agent': userAgent,
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'password',
      username,
      password,
    }).toString(),
  });

  if (!res.ok) {
    throw new Error(`Reddit OAuth failed (${res.status}). Please check your credentials.`);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(`Reddit OAuth error: ${data.error} - ${data.message || data.error_description || ''}`);
  }

  const accessToken = data.access_token;
  const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;

  const meRes = await fetch('https://oauth.reddit.com/api/v1/me', {
    headers: { 'User-Agent': userAgent, Authorization: `Bearer ${accessToken}` },
  });
  if (!meRes.ok) throw new Error(`Token verification failed (${meRes.status}).`);
  const meData = await meRes.json();
  if (!meData.name) throw new Error('Failed to verify Reddit session.');

  saveRedditSession(sessionPath, {
    authMode: 'oauth',
    accessToken,
    expiresAt,
    username: meData.name,
  });

  return { provider: 'reddit', loggedIn: true, username: meData.name, authMode: 'oauth', sessionPath };
};

// ── Cookie-based Login (old.reddit.com legacy API) ──

const parseCookies = (setCookieHeaders) => {
  const cookies = {};
  for (const header of setCookieHeaders) {
    const [pair] = header.split(';');
    const [name, ...valueParts] = pair.split('=');
    cookies[name.trim()] = valueParts.join('=').trim();
  }
  return cookies;
};

const loginCookie = async ({ sessionPath, username, password }) => {
  // Step 1: Login via old.reddit.com/api/login
  const res = await fetch('https://old.reddit.com/api/login', {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      user: username,
      passwd: password,
      rem: 'true',
      api_type: 'json',
    }).toString(),
    redirect: 'manual',
  });

  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const cookies = parseCookies(setCookies);

  let data;
  try { data = await res.json(); } catch { data = {}; }

  const jsonData = data.json?.data || data.json || data;
  const modhash = jsonData.modhash || '';
  const redditSession = cookies.reddit_session || '';

  if (!modhash && !redditSession) {
    const errors = data.json?.errors;
    if (errors?.length) {
      throw new Error(`Reddit login failed: ${errors.map(e => e.join(' ')).join(', ')}`);
    }
    throw new Error('Reddit cookie login failed. No session cookie received. Check credentials or try OAuth.');
  }

  // Step 2: Verify session by getting /api/me.json
  const cookieHeader = redditSession ? `reddit_session=${redditSession}` : '';
  const meRes = await fetch('https://old.reddit.com/api/me.json', {
    headers: {
      'User-Agent': USER_AGENT,
      Cookie: cookieHeader,
    },
  });

  let meData;
  try { meData = await meRes.json(); } catch { meData = {}; }
  const verifiedUsername = meData.data?.name || username;
  const verifiedModhash = meData.data?.modhash || modhash;

  saveRedditSession(sessionPath, {
    authMode: 'cookie',
    redditSession,
    modhash: verifiedModhash,
    username: verifiedUsername,
  });

  return { provider: 'reddit', loggedIn: true, username: verifiedUsername, authMode: 'cookie', sessionPath };
};

// ── Playwright Browser Login ──

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const waitForRedditLoginFinish = async (page, timeoutMs = 60000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const url = page.url();
    // Login page redirects to / or /home or user page on success
    if (
      url === 'https://www.reddit.com/' ||
      url.startsWith('https://www.reddit.com/home') ||
      url.startsWith('https://www.reddit.com/?') ||
      (url.includes('reddit.com') && !url.includes('/login') && !url.includes('/register') && !url.includes('/account/login'))
    ) {
      return true;
    }
    await sleep(1000);
  }
  return false;
};

const loginBrowser = async ({ sessionPath, username, password, headless = false, manual = false }) => {
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });

  // Reddit blocks CDP-based browsers (chromeManager).
  // Use Playwright native launch mode instead — no remote-debugging-port.
  const { chromium } = require('playwright');

  // Persistent context preserves cookies/localStorage across sessions
  fs.mkdirSync(REDDIT_STATE_DIR, { recursive: true });
  const context = await chromium.launchPersistentContext(REDDIT_STATE_DIR, {
    headless,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
    ],
    userAgent: USER_AGENT,
    locale: 'en-US',
    viewport: { width: 1280, height: 900 },
  });

  const page = context.pages()[0] || (await context.newPage());

  // Anti-detection script
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    delete navigator.__proto__.webdriver;
    window.chrome = { runtime: {} };
  });

  try {
    // Check if already logged in (persistent context may have session)
    await page.goto('https://www.reddit.com/', { waitUntil: 'domcontentloaded' });
    await sleep(3000);

    const alreadyLoggedIn = await page.evaluate(() => {
      const hasUserMenu = document.querySelector('[id*="USER_DROPDOWN"]') ||
        document.querySelector('button[aria-label*="profile"]') ||
        document.querySelector('[data-testid="user-menu"]') ||
        document.querySelector('#expand-user-drawer-button');
      return Boolean(hasUserMenu);
    });

    if (alreadyLoggedIn) {
      const cookies = await extractContextCookies(context);

      saveRedditSession(sessionPath, {
        authMode: 'browser',
        cookies,
        username,
      });

      return { provider: 'reddit', loggedIn: true, username, authMode: 'browser', sessionPath };
    }

    // Navigate to login page
    await page.goto('https://www.reddit.com/login', { waitUntil: 'domcontentloaded' });
    await sleep(2000);

    let loginSuccess = false;

    if (manual) {
      console.log('');
      console.log('==============================');
      console.log('Switching to manual login mode.');
      console.log('Please complete the Reddit login in the browser.');
      console.log('Login must be completed within 5 minutes.');
      console.log('==============================');
      loginSuccess = await waitForRedditLoginFinish(page, 300000);
    } else {
      if (!username || !password) {
        throw new Error('Reddit login requires username and password. Set REDDIT_USERNAME / REDDIT_PASSWORD environment variables.');
      }

      // Fill username — try multiple selectors (Reddit changes UI frequently)
      const usernameSelectors = [
        'input[name="username"]',
        '#loginUsername',
        'input[id="login-username"]',
        'input[type="text"][autocomplete="username"]',
      ];

      let usernameFilled = false;
      for (const sel of usernameSelectors) {
        try {
          const el = await page.$(sel);
          if (el) {
            await el.click();
            await sleep(200);
            await el.fill(username);
            usernameFilled = true;
            break;
          }
        } catch { /* try next */ }
      }

      if (!usernameFilled) {
        await page.evaluate((u) => {
          const inputs = document.querySelectorAll('input[type="text"], input[name="username"]');
          for (const inp of inputs) {
            if (inp.name === 'username' || inp.id?.includes('username') || inp.id?.includes('login')) {
              inp.value = u;
              inp.dispatchEvent(new Event('input', { bubbles: true }));
              return;
            }
          }
          if (inputs[0]) {
            inputs[0].value = u;
            inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, username);
      }

      await sleep(500);

      // Fill password
      const passwordSelectors = [
        'input[name="password"]',
        '#loginPassword',
        'input[id="login-password"]',
        'input[type="password"]',
      ];

      let passwordFilled = false;
      for (const sel of passwordSelectors) {
        try {
          const el = await page.$(sel);
          if (el) {
            await el.click();
            await sleep(200);
            await el.fill(password);
            passwordFilled = true;
            break;
          }
        } catch { /* try next */ }
      }

      if (!passwordFilled) {
        await page.evaluate((p) => {
          const inp = document.querySelector('input[type="password"]');
          if (inp) {
            inp.value = p;
            inp.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, password);
      }

      await sleep(500);

      // Click login button
      const submitSelectors = [
        'button[type="submit"]',
        'button:has-text("Log In")',
        'button:has-text("Log in")',
        'button:has-text("Sign in")',
      ];

      let submitted = false;
      for (const sel of submitSelectors) {
        try {
          const btn = await page.$(sel);
          if (btn) {
            await btn.click();
            submitted = true;
            break;
          }
        } catch { /* try next */ }
      }

      if (!submitted) {
        await page.keyboard.press('Enter');
      }

      await sleep(3000);

      // Check for CAPTCHA or 2FA — give user time to solve manually
      // Note: avoid matching "verification" alone — Reddit login page contains this word normally
      const hasCaptchaOr2FA = await page.evaluate(() => {
        const url = window.location.href;
        // If already redirected away from login, no captcha
        if (!url.includes('/login') && !url.includes('/account/login')) return false;
        const content = document.body.innerText?.toLowerCase() || '';
        return content.includes('captcha') ||
          content.includes('two-factor') ||
          content.includes('2fa') ||
          content.includes('verify your identity') ||
          content.includes('check your email') ||
          Boolean(document.querySelector('iframe[src*="captcha"]')) ||
          Boolean(document.querySelector('iframe[src*="recaptcha"]'));
      });

      if (hasCaptchaOr2FA) {
        console.log('');
        console.log('==============================');
        console.log('CAPTCHA or 2FA detected.');
        console.log('Please complete verification in the browser within 2 minutes.');
        console.log('==============================');
        loginSuccess = await waitForRedditLoginFinish(page, 120000);
      } else {
        loginSuccess = await waitForRedditLoginFinish(page, 30000);
      }
    }

    if (!loginSuccess) {
      throw new Error('Reddit login failed. Please verify credentials or use --manual mode.');
    }

    // Extract all cookies
    await sleep(1000);
    const cookies = await extractContextCookies(context);

    if (cookies.length === 0) {
      throw new Error('No Reddit cookies found after login. Login may have failed silently.');
    }

    saveRedditSession(sessionPath, {
      authMode: 'browser',
      cookies,
      username,
    });

    return { provider: 'reddit', loggedIn: true, username, authMode: 'browser', sessionPath };
  } finally {
    await context.close().catch(() => {});
  }
};

/**
 * Extract cookies from Playwright context and format for session storage.
 * Filters to reddit.com domains only.
 */
const extractContextCookies = async (context) => {
  const allCookies = await context.cookies(['https://www.reddit.com', 'https://reddit.com']);
  return allCookies
    .filter((c) => c.domain.includes('reddit.com'))
    .map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path || '/',
      expires: c.expires || -1,
      httpOnly: c.httpOnly || false,
      secure: c.secure || false,
      sameSite: c.sameSite || 'Lax',
    }));
};

// ── Main Login Router ──

const createLogin = ({ sessionPath }) => async ({
  clientId,
  clientSecret,
  username,
  password,
  headless,
  manual,
} = {}) => {
  const creds = readRedditCredentials();
  const resolvedClientId = clientId || creds.clientId;
  const resolvedClientSecret = clientSecret || creds.clientSecret;
  const resolvedUsername = username || creds.username;
  const resolvedPassword = password || creds.password;

  if (!resolvedUsername || !resolvedPassword) {
    throw new Error(
      'Reddit login requires username and password. ' +
      'Set REDDIT_USERNAME / REDDIT_PASSWORD environment variables.',
    );
  }

  // OAuth2 path: if client_id + client_secret are available
  if (resolvedClientId && resolvedClientSecret) {
    return loginOAuth({
      sessionPath,
      clientId: resolvedClientId,
      clientSecret: resolvedClientSecret,
      username: resolvedUsername,
      password: resolvedPassword,
    });
  }

  // Browser path: Playwright login (cookie API is blocked by Reddit)
  return loginBrowser({
    sessionPath,
    username: resolvedUsername,
    password: resolvedPassword,
    headless: headless !== undefined ? headless : false,
    manual: manual || false,
  });
};

module.exports = {
  createLogin,
  buildUserAgent,
  loginOAuth,
  loginCookie,
  loginBrowser,
};
