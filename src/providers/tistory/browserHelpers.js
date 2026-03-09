const {
  KAKAO_ACCOUNT_CONFIRM_SELECTORS,
} = require('./selectors');

const pickValue = async (page, selectors) => {
  for (const selector of selectors) {
    const element = await page.$(selector);
    if (element) {
      return selector;
    }
  }
  return null;
};

const fillBySelector = async (page, selectors, value) => {
  const selector = await pickValue(page, selectors);
  if (!selector) {
    return false;
  }
  await page.locator(selector).fill(value);
  return true;
};

const clickSubmit = async (page, selectors) => {
  const selector = await pickValue(page, selectors);
  if (!selector) {
    return false;
  }
  await page.locator(selector).click({ timeout: 5000 });
  return true;
};

const checkBySelector = async (page, selectors) => {
  const selector = await pickValue(page, selectors);
  if (!selector) {
    return false;
  }
  const locator = page.locator(selector);
  const isChecked = await locator.isChecked().catch(() => false);
  if (!isChecked) {
    await locator.check({ force: true }).catch(() => {});
  }
  return true;
};

const hasElement = async (page, selectors) => {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count();
    if (count > 0) {
      return true;
    }
  }
  return false;
};

const hasKakaoAccountConfirmScreen = async (page) => {
  const url = page.url();
  const isKakaoDomain = url.includes('accounts.kakao.com') || url.includes('kauth.kakao.com');
  if (!isKakaoDomain) {
    return false;
  }

  return await hasElement(page, KAKAO_ACCOUNT_CONFIRM_SELECTORS.textMarker);
};

const clickKakaoAccountContinue = async (page) => {
  if (!(await hasKakaoAccountConfirmScreen(page))) {
    return false;
  }

  const continueSelector = await pickValue(page, KAKAO_ACCOUNT_CONFIRM_SELECTORS.continue);
  if (!continueSelector) {
    return false;
  }

  await page.locator(continueSelector).click({ timeout: 5000 });
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(800);
  return true;
};

module.exports = {
  pickValue,
  fillBySelector,
  clickSubmit,
  checkBySelector,
  hasElement,
  hasKakaoAccountConfirmScreen,
  clickKakaoAccountContinue,
};
