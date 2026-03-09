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
 * askForAuthentication 팩토리.
 * sessionPath, tistoryApi, pending2faResult를 외부에서 주입받는다.
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
    throw new Error('티스토리 로그인 요청에 id/pw가 없습니다. id/pw를 먼저 전달하거나 TISTORY_USERNAME/TISTORY_PASSWORD를 설정해 주세요.');
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
        throw new Error('카카오 로그인 버튼을 찾지 못했습니다. 로그인 화면 UI가 변경되었는지 확인해 주세요.');
      }

      await page.locator(kakaoLoginSelector).click({ timeout: 5000 }).catch(() => {});
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await page.waitForTimeout(800);

      let finalLoginStatus = false;
      let pendingTwoFactorAction = false;

      if (manual) {
        console.log('');
        console.log('==============================');
        console.log('수동 로그인 모드로 전환합니다.');
        console.log('브라우저에서 직접 ID/PW/2차 인증을 완료한 뒤, 로그인 완료 상태를 기다립니다.');
        console.log('로그인 완료 또는 2차 인증은 최대 5분 내에 처리해 주세요.');
        console.log('==============================');
        finalLoginStatus = await waitForLoginFinish(page, context, 300000);
      } else if (shouldAutoFill) {
        const usernameFilled = await fillBySelector(page, KAKAO_LOGIN_SELECTORS.username, loginId);
        const passwordFilled = await fillBySelector(page, KAKAO_LOGIN_SELECTORS.password, loginPw);
        if (!usernameFilled || !passwordFilled) {
          throw new Error('카카오 로그인 폼 입력 필드를 찾지 못했습니다. 티스토리 로그인 화면 변경 시도를 확인해 주세요.');
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
            throw new Error('OTP 입력 필드를 찾지 못했습니다. 로그인 페이지를 확인해 주세요.');
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
              throw new Error('2차 인증 입력 필드를 찾지 못했습니다. 로그인 페이지를 확인해 주세요.');
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
              throw new Error('카카오 이메일 인증 입력 필드를 찾지 못했습니다. 로그인 페이지를 확인해 주세요.');
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
        throw new Error('로그인에 실패했습니다. 아이디/비밀번호가 정확한지 확인하고, 없으면 환경변수 TISTORY_USERNAME/TISTORY_PASSWORD를 다시 설정해 주세요.');
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
