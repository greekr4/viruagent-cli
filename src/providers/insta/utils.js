const readInstaCredentials = () => {
  const username = process.env.INSTA_USERNAME || process.env.INSTAGRAM_USERNAME || process.env.INSTA_USER;
  const password = process.env.INSTA_PASSWORD || process.env.INSTAGRAM_PASSWORD || process.env.INSTA_PW;
  return {
    username: typeof username === 'string' && username.trim() ? username.trim() : null,
    password: typeof password === 'string' && password.trim() ? password.trim() : null,
  };
};

const parseInstaSessionError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return [
    '세션 파일이 없습니다',
    '세션에 유효한 쿠키',
    '세션이 만료',
    '로그인이 필요합니다',
    'login_required',
    'checkpoint_required',
    '401',
    '403',
    '302',
  ].some((token) => message.includes(token.toLowerCase()));
};

const buildLoginErrorMessage = (error) => String(error?.message || '세션 검증에 실패했습니다.');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = {
  readInstaCredentials,
  parseInstaSessionError,
  buildLoginErrorMessage,
  sleep,
};
