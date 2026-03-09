const LOGIN_OTP_SELECTORS = [
    'input[name*="otp"]',
    'input[placeholder*="인증"]',
    'input[autocomplete="one-time-code"]',
    'input[name*="code"]',
];

const KAKAO_TRIGGER_SELECTORS = [
  'a.link_kakao_id',
  'a:has-text("카카오계정으로 로그인")',
];

const KAKAO_LOGIN_SELECTORS = {
  username: ['input[name="loginId"]', '#loginId--1', 'input[placeholder*="카카오메일"]'],
  password: ['input[name="password"]', '#password--2', 'input[type="password"]'],
  submit: ['button[type="submit"]', 'button:has-text("로그인")', '.btn_g.highlight.submit'],
  rememberLogin: ['#saveSignedIn--4', 'input[name="saveSignedIn"]'],
};

const KAKAO_2FA_SELECTORS = {
  start: ['#tmsTwoStepVerification', '#emailTwoStepVerification'],
  emailModeButton: ['button:has-text("이메일로 인증하기")', '.link_certify'],
  codeInput: ['input[name="email_passcode"]', '#passcode--6', 'input[placeholder*="인증번호"]'],
  confirm: ['button:has-text("확인")', 'button.btn_g.submit', 'button[type="submit"]'],
  rememberDevice: ['#isRememberBrowser--5', 'input[name="isRememberBrowser"]'],
};

const KAKAO_ACCOUNT_CONFIRM_SELECTORS = {
  textMarker: [
    'text=해당 카카오 계정으로',
    'text=티스토리\n해당 카카오 계정으로',
    'text=해당 카카오계정으로 로그인',
  ],
  continue: [
    'button:has-text("계속하기")',
    'a:has-text("계속하기")',
    'button:has-text("다음")',
  ],
  otherAccount: [
    'button:has-text("다른 카카오계정으로 로그인")',
    'a:has-text("다른 카카오계정으로 로그인")',
  ],
};

module.exports = {
  LOGIN_OTP_SELECTORS,
  KAKAO_TRIGGER_SELECTORS,
  KAKAO_LOGIN_SELECTORS,
  KAKAO_2FA_SELECTORS,
  KAKAO_ACCOUNT_CONFIRM_SELECTORS,
};
