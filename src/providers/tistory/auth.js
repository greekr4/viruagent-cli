const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { readCredentialsFromEnv } = require('./utils');
const {
  pickValue,
  fillBySelector,
  clickSubmit,
  checkBySelector,
  hasElement,
} = require('./browserHelpers');
const { waitForLoginFinish, persistTistorySession } = require('./session');
const {
  LOGIN_OTP_SELECTORS,
  KAKAO_TRIGGER_SELECTORS,
  KAKAO_LOGIN_SELECTORS,
  KAKAO_2FA_SELECTORS,
} = require('./selectors');

/**
 * askForAuthentication factory.
 * Receives sessionPath, tistoryApi, and pending2faResult via dependency injection.
 */
const createAskForAuthentication = ({ sessionPath, tistoryApi, pending2faResult }) => async ({
  headless = false,
  manual = false,
  username,
  password,
  twoFactorCode,
} = {}) => {
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });

  const resolvedUsername = username || readCredentialsFromEnv().username;
  const resolvedPassword = password || readCredentialsFromEnv().password;
  const shouldAutoFill = !manual;

  if (!manual && (!resolvedUsername || !resolvedPassword)) {
    throw new Error('Tistory login requires id/pw. Please provide id/pw or set TISTORY_USERNAME/TISTORY_PASSWORD environment variables.');
  }

  const browser = await chromium.launch({
    headless: manual ? false : headless,
  });
  const context = await browser.newContext();

  const page = context.pages()[0] || (await context.newPage());

    try {
      await page.goto('https://www.tistory.com/auth/login', {
        waitUntil: 'domcontentloaded',
      });

      const loginId = resolvedUsername;
      const loginPw = resolvedPassword;

      const kakaoLoginSelector = await pickValue(page, KAKAO_TRIGGER_SELECTORS);
      if (!kakaoLoginSelector) {
        throw new Error('Could not find the Kakao login button. Please check if the login page UI has changed.');
      }

      await page.locator(kakaoLoginSelector).click({ timeout: 5000 }).catch(() => {});
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await page.waitForTimeout(800);

      let finalLoginStatus = false;
      let pendingTwoFactorAction = false;

      if (manual) {
        console.log('');
        console.log('==============================');
        console.log('Switching to manual login mode.');
        console.log('Please complete ID/PW/2FA verification in the browser.');
        console.log('Login or 2FA must be completed within 5 minutes.');
        console.log('==============================');
        finalLoginStatus = await waitForLoginFinish(page, context, 300000);
      } else if (shouldAutoFill) {
        const usernameFilled = await fillBySelector(page, KAKAO_LOGIN_SELECTORS.username, loginId);
        const passwordFilled = await fillBySelector(page, KAKAO_LOGIN_SELECTORS.password, loginPw);
        if (!usernameFilled || !passwordFilled) {
          throw new Error('Could not find Kakao login form input fields. Please check if the Tistory login page has changed.');
        }

        await checkBySelector(page, KAKAO_LOGIN_SELECTORS.rememberLogin);
        const kakaoSubmitted = await clickSubmit(page, KAKAO_LOGIN_SELECTORS.submit);
        if (!kakaoSubmitted) {
          await page.keyboard.press('Enter');
        }

        finalLoginStatus = await waitForLoginFinish(page, context);

        if (!finalLoginStatus && await hasElement(page, LOGIN_OTP_SELECTORS)) {
          if (!twoFactorCode) {
            return pending2faResult('otp');
          }
          const otpFilled = await fillBySelector(page, LOGIN_OTP_SELECTORS, twoFactorCode);
          if (!otpFilled) {
            throw new Error('Could not find the OTP input field. Please check the login page.');
          }
          await page.keyboard.press('Enter');
          finalLoginStatus = await waitForLoginFinish(page, context, 45000);
        } else if (!finalLoginStatus && (await hasElement(page, KAKAO_2FA_SELECTORS.start) || page.url().includes('tmsTwoStepVerification') || page.url().includes('emailTwoStepVerification'))) {
          await checkBySelector(page, KAKAO_2FA_SELECTORS.rememberDevice);
          const isEmailModeAvailable = await hasElement(page, KAKAO_2FA_SELECTORS.emailModeButton);
          const hasEmailCodeInput = await hasElement(page, KAKAO_2FA_SELECTORS.codeInput);

          if (hasEmailCodeInput && twoFactorCode) {
            const codeFilled = await fillBySelector(page, KAKAO_2FA_SELECTORS.codeInput, twoFactorCode);
            if (!codeFilled) {
              throw new Error('Could not find the 2FA input field. Please check the login page.');
            }
            const confirmed = await clickSubmit(page, KAKAO_2FA_SELECTORS.confirm);
            if (!confirmed) {
              await page.keyboard.press('Enter');
            }
            finalLoginStatus = await waitForLoginFinish(page, context, 45000);
          } else if (!twoFactorCode) {
            pendingTwoFactorAction = true;
          } else if (isEmailModeAvailable) {
            await clickSubmit(page, KAKAO_2FA_SELECTORS.emailModeButton).catch(() => {});
            await page.waitForLoadState('domcontentloaded').catch(() => {});
            await page.waitForTimeout(800);

            const codeFilled = await fillBySelector(page, KAKAO_2FA_SELECTORS.codeInput, twoFactorCode);
            if (!codeFilled) {
              throw new Error('Could not find the Kakao email verification input field. Please check the login page.');
            }

            const confirmed = await clickSubmit(page, KAKAO_2FA_SELECTORS.confirm);
            if (!confirmed) {
              await page.keyboard.press('Enter');
            }
            finalLoginStatus = await waitForLoginFinish(page, context, 45000);
          } else {
            return pending2faResult('kakao');
          }
        }
      }

      if (!finalLoginStatus) {
        if (pendingTwoFactorAction) {
          return pending2faResult('kakao');
        }
        throw new Error('Login failed. Please verify your credentials and ensure TISTORY_USERNAME/TISTORY_PASSWORD environment variables are set correctly.');
      }

      await context.storageState({ path: sessionPath });
      await persistTistorySession(context, sessionPath);

      tistoryApi.resetState();
      const blogName = await tistoryApi.initBlog();
      return {
        provider: 'tistory',
        loggedIn: true,
        blogName,
        blogUrl: `https://${blogName}.tistory.com`,
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
