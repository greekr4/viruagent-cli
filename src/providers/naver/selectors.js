const NAVER_LOGIN_SELECTORS = {
  username: '#id',
  password: '#pw',
  submit: '#log\\.login',
  keepLogin: '.keep_check',
};

const NAVER_LOGIN_ERROR_PATTERNS = {
  wrongPassword: '비밀번호가 잘못',
  accountProtected: '회원님의 아이디를 보호',
  phoneNumberMismatch: '등록된 정보와 일치하지',
  regionBlocked: '허용하지 않은 지역에서',
  captcha: ['자동입력 방지 문자', '자동입력 방지문자', 'captcha'],
  usageRestricted: '비정상적인 활동이 감지되어',
  twoFactor: '2단계 인증 알림',
  operationViolation: '운영원칙 위반',
  newDevice: '새로운 기기(브라우저)에서 로그인되었습니다.',
};

module.exports = {
  NAVER_LOGIN_SELECTORS,
  NAVER_LOGIN_ERROR_PATTERNS,
};
