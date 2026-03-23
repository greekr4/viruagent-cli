const fs = require('fs');
const path = require('path');
const { readNaverCredentials, sleep } = require('./utils');
const { isLoggedInByCookies, persistNaverSession } = require('./session');
const { NAVER_LOGIN_SELECTORS, NAVER_LOGIN_ERROR_PATTERNS } = require('./selectors');
const {
  CHROME_PROFILE_DIR,
  launchChrome,
  connectChrome,
} = require('../chromeManager');
const NAVER_PROFILE_DIR = path.join(CHROME_PROFILE_DIR, 'naver');

const ANTI_DETECTION_SCRIPT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'] });
  window.chrome = { runtime: {} };
`;

const waitForNaverLoginFinish = async (page, context, timeoutMs = 45000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isLoggedInByCookies(context, page)) return true;

    const url = page.url();
    if (url.includes('naver.com') && !url.includes('nid.naver.com/nidlogin')) return true;

    await sleep(1000);
  }
  return false;
};

const checkLoginResult = async (page) => {
  const content = await page.content();
  const patterns = NAVER_LOGIN_ERROR_PATTERNS;

  if (content.includes(patterns.wrongPassword)) {
    return { success: false, error: 'wrong_password', message: 'Incorrect password.' };
  }
  if (content.includes(patterns.accountProtected)) {
    return { success: false, error: 'account_protected', message: 'Account protection is enabled.' };
  }
  if (content.includes(patterns.regionBlocked)) {
    return { success: false, error: 'region_blocked', message: 'Access from a disallowed region was detected.' };
  }
  if (content.includes(patterns.usageRestricted)) {
    return { success: false, error: 'usage_restricted', message: 'Abnormal activity detected. Usage has been restricted.' };
  }
  if (content.includes(patterns.twoFactor)) {
    return { success: false, error: 'two_factor', message: 'Two-factor authentication required. Please log in using --manual mode.' };
  }

  // Captcha detection
  const hasCaptcha = patterns.captcha.some((p) => content.toLowerCase().includes(p.toLowerCase()));
  if (hasCaptcha) {
    return { success: false, error: 'captcha', message: 'Captcha detected. Please use --manual mode.' };
  }

  // Success (including operation violation notice)
  if (content.includes(patterns.operationViolation) || content.includes(patterns.newDevice)) {
    return { success: true };
  }

  const url = page.url();
  if (url.includes('naver.com') && !url.includes('nid.naver.com/nidlogin')) {
    return { success: true };
  }

  return { success: false, error: 'unknown', message: 'Unable to verify login status.' };
};

const createAskForAuthentication = ({ sessionPath, naverApi }) => async ({
  headless = false,
  manual = false,
  username,
  password,
} = {}) => {
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });

  const resolvedUsername = username || readNaverCredentials().username;
  const resolvedPassword = password || readNaverCredentials().password;

  // Launch real Chrome with persistent profile + CDP
  // TIP: openchrome (npx openchrome-mcp setup) skips 2FA by reusing existing sessions.
  const port = await launchChrome(NAVER_PROFILE_DIR);
  const { browser, context, page } = await connectChrome(port);

  try {
    // Check if already logged in (openchrome profile may have active session)
    // Navigate to myinfo — redirects to login if not authenticated, stays if logged in
    await page.goto('https://nid.naver.com/user2/help/myInfo', { waitUntil: 'domcontentloaded' });
    await sleep(1000);

    const afterUrl = page.url();
    if (!afterUrl.includes('nidlogin') && !afterUrl.includes('nid.naver.com/nidlogin')) {
      await persistNaverSession(context, page, sessionPath);
      naverApi.resetState();
      const blogId = await naverApi.initBlog();
      return {
        provider: 'naver',
        loggedIn: true,
        blogId,
        blogUrl: `https://blog.naver.com/${blogId}`,
        sessionPath,
      };
    }

    await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'domcontentloaded' });
    await sleep(1000);

    if (!manual && (!resolvedUsername || !resolvedPassword)) {
      throw new Error('Naver login requires id/pw. Set the NAVER_USERNAME/NAVER_PASSWORD environment variables or use --manual mode.');
    }

    let loginSuccess = false;

    if (manual) {
      console.log('');
      console.log('==============================');
      console.log('Switching to manual login mode.');
      console.log('Please complete the Naver login in the browser.');
      console.log('Please complete the login within 5 minutes.');
      console.log('==============================');
      loginSuccess = await waitForNaverLoginFinish(page, context, 300000);
    } else {
      // Inject ID/PW via JS (instead of fill() — bypasses bot detection)
      await page.evaluate((id) => {
        const el = document.getElementById('id');
        if (el) el.value = id;
      }, resolvedUsername);
      await sleep(300);

      await page.evaluate((pw) => {
        const el = document.getElementById('pw');
        if (el) el.value = pw;
      }, resolvedPassword);
      await sleep(300);

      // Check "keep me logged in"
      const keepCheck = await page.$(NAVER_LOGIN_SELECTORS.keepLogin);
      if (keepCheck) {
        await keepCheck.click().catch(() => {});
        await sleep(300);
      }

      // Click login button
      const loginBtn = await page.$(NAVER_LOGIN_SELECTORS.submit);
      if (loginBtn) {
        await loginBtn.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await sleep(3000);

      // Check result
      const result = await checkLoginResult(page);
      if (!result.success) {
        throw new Error(result.message);
      }

      loginSuccess = await waitForNaverLoginFinish(page, context, 15000);
      if (!loginSuccess) {
        // Additional URL-based check
        const url = page.url();
        if (url.includes('naver.com') && !url.includes('nid.naver.com/nidlogin')) {
          loginSuccess = true;
        }
      }
    }

    if (!loginSuccess) {
      throw new Error('Naver login failed. Please verify your id/password or use --manual mode.');
    }

    await persistNaverSession(context, page, sessionPath);

    naverApi.resetState();
    const blogId = await naverApi.initBlog();
    return {
      provider: 'naver',
      loggedIn: true,
      blogId,
      blogUrl: `https://blog.naver.com/${blogId}`,
      sessionPath,
    };
  } finally {
    // Don't close browser — keep Chrome running with persistent profile
    await browser.close().catch(() => {});
  }
};

module.exports = {
  createAskForAuthentication,
};
