const readThreadsCredentials = () => {
  const username = process.env.THREADS_USERNAME || process.env.INSTA_USERNAME || process.env.INSTAGRAM_USERNAME;
  const password = process.env.THREADS_PASSWORD || process.env.INSTA_PASSWORD || process.env.INSTAGRAM_PASSWORD;
  return {
    username: typeof username === 'string' && username.trim() ? username.trim() : null,
    password: typeof password === 'string' && password.trim() ? password.trim() : null,
  };
};

const parseThreadsSessionError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return [
    'no session file found',
    'no valid token in session',
    'session expired',
    'login required',
    'login_required',
    'checkpoint_required',
    '401',
    '403',
  ].some((token) => message.includes(token.toLowerCase()));
};

const buildLoginErrorMessage = (error) => String(error?.message || 'Session validation failed.');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = {
  readThreadsCredentials,
  parseThreadsSessionError,
  buildLoginErrorMessage,
  sleep,
};
