const readNaverCredentials = () => {
  const username = process.env.NAVER_USERNAME || process.env.NAVER_USER || process.env.NAVER_ID;
  const password = process.env.NAVER_PASSWORD || process.env.NAVER_PW;
  return {
    username: typeof username === 'string' && username.trim() ? username.trim() : null,
    password: typeof password === 'string' && password.trim() ? password.trim() : null,
  };
};

const parseNaverSessionError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return [
    '세션 파일이 없습니다',
    '세션에 유효한 쿠키',
    '세션이 만료',
    '로그인이 필요합니다',
    'blogid를 찾을 수 없습니다',
    '블로그 정보 조회 실패',
    '다시 로그인',
    '401',
    '403',
  ].some((token) => message.includes(token.toLowerCase()));
};

const buildLoginErrorMessage = (error) => String(error?.message || '세션 검증에 실패했습니다.');

const normalizeNaverTagList = (value = '') => {
  const source = Array.isArray(value)
    ? value
    : String(value || '').replace(/\r?\n/g, ',').split(',');
  return source
    .map((tag) => String(tag || '').trim())
    .filter(Boolean)
    .map((tag) => tag.replace(/["']/g, '').trim())
    .filter(Boolean)
    .slice(0, 10)
    .join(',');
};

const mapNaverVisibility = (visibility) => {
  const normalized = String(visibility || 'public').toLowerCase();
  if (normalized === 'private') return 0;
  if (normalized === 'protected' || normalized === 'mutual') return 1;
  return 2; // public (openType: 2)
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = {
  readNaverCredentials,
  parseNaverSessionError,
  buildLoginErrorMessage,
  normalizeNaverTagList,
  mapNaverVisibility,
  sleep,
};
