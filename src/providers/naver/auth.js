const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { readNaverCredentials, sleep } = require('./utils');
const { isLoggedInByCookies, persistNaverSession } = require('./session');
const { NAVER_LOGIN_SELECTORS, NAVER_LOGIN_ERROR_PATTERNS } = require('./selectors');

const ANTI_DETECTION_SCRIPT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'] });
  window.chrome = { runtime: {} };
`;

const waitForNaverLoginFinish = async (page, context, timeoutMs = 45000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isLoggedInByCookies(context)) return true;

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
    return { success: false, error: 'wrong_password', message: '비밀번호가 잘못되었습니다.' };
  }
  if (content.includes(patterns.accountProtected)) {
    return { success: false, error: 'account_protected', message: '계정 보호조치가 활성화되어 있습니다.' };
  }
  if (content.includes(patterns.regionBlocked)) {
    return { success: false, error: 'region_blocked', message: '허용하지 않은 지역에서 접속이 감지되었습니다.' };
  }
  if (content.includes(patterns.usageRestricted)) {
    return { success: false, error: 'usage_restricted', message: '비정상적인 활동이 감지되어 이용이 제한되었습니다.' };
  }
  if (content.includes(patterns.twoFactor)) {
    return { success: false, error: 'two_factor', message: '2단계 인증이 필요합니다. --manual 모드로 로그인해 주세요.' };
  }

  // 캡차 감지
  const hasCaptcha = patterns.captcha.some((p) => content.toLowerCase().includes(p.toLowerCase()));
  if (hasCaptcha) {
    return { success: false, error: 'captcha', message: '캡차가 감지되었습니다. --manual 모드를 사용해 주세요.' };
  }

  // 성공 (운영원칙 위반 포함)
  if (content.includes(patterns.operationViolation) || content.includes(patterns.newDevice)) {
    return { success: true };
  }

  const url = page.url();
  if (url.includes('naver.com') && !url.includes('nid.naver.com/nidlogin')) {
    return { success: true };
  }

  return { success: false, error: 'unknown', message: '로그인 상태를 확인할 수 없습니다.' };
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

  if (!manual && (!resolvedUsername || !resolvedPassword)) {
    throw new Error('네이버 로그인에 id/pw가 필요합니다. 환경변수 NAVER_USERNAME/NAVER_PASSWORD를 설정하거나 --manual 모드를 사용해 주세요.');
  }

  const browser = await chromium.launch({
    headless: manual ? false : headless,
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  });

  await context.addInitScript(ANTI_DETECTION_SCRIPT);
  const page = context.pages()[0] || (await context.newPage());

  try {
    await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'domcontentloaded' });
    await sleep(1500);

    let loginSuccess = false;

    if (manual) {
      console.log('');
      console.log('==============================');
      console.log('수동 로그인 모드로 전환합니다.');
      console.log('브라우저에서 직접 네이버 로그인을 완료해 주세요.');
      console.log('최대 5분 내에 로그인을 완료해 주세요.');
      console.log('==============================');
      loginSuccess = await waitForNaverLoginFinish(page, context, 300000);
    } else {
      // JS 인젝션으로 ID/PW 입력 (fill() 대신 — 봇 감지 우회)
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

      // 로그인 유지 체크
      const keepCheck = await page.$(NAVER_LOGIN_SELECTORS.keepLogin);
      if (keepCheck) {
        await keepCheck.click().catch(() => {});
        await sleep(300);
      }

      // 로그인 버튼 클릭
      const loginBtn = await page.$(NAVER_LOGIN_SELECTORS.submit);
      if (loginBtn) {
        await loginBtn.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await sleep(3000);

      // 결과 확인
      const result = await checkLoginResult(page);
      if (!result.success) {
        throw new Error(result.message);
      }

      loginSuccess = await waitForNaverLoginFinish(page, context, 15000);
      if (!loginSuccess) {
        // URL 기반 추가 확인
        const url = page.url();
        if (url.includes('naver.com') && !url.includes('nid.naver.com/nidlogin')) {
          loginSuccess = true;
        }
      }
    }

    if (!loginSuccess) {
      throw new Error('네이버 로그인에 실패했습니다. 아이디/비밀번호를 확인하거나 --manual 모드를 사용해 주세요.');
    }

    await persistNaverSession(context, sessionPath);

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
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
};

module.exports = {
  createAskForAuthentication,
};
