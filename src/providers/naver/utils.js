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
    'session file not found',
    'no valid cookies',
    'session expired',
    'login required',
    'find blogid',
    'failed to fetch blog info',
    'log in again',
    '401',
    '403',
  ].some((token) => message.includes(token.toLowerCase()));
};

const buildLoginErrorMessage = (error) => String(error?.message || 'Session validation failed.');

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
