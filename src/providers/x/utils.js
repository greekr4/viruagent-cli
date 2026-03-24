const readXCredentials = () => {
  const authToken = process.env.X_AUTH_TOKEN || process.env.TWITTER_AUTH_TOKEN;
  const ct0 = process.env.X_CT0 || process.env.TWITTER_CT0;
  return {
    authToken: typeof authToken === 'string' && authToken.trim() ? authToken.trim() : null,
    ct0: typeof ct0 === 'string' && ct0.trim() ? ct0.trim() : null,
  };
};

const parseXSessionError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return [
    'no session file found',
    'no valid cookies in session',
    'session expired',
    'authentication error',
    'unauthorized',
    '401',
    '403',
  ].some((token) => message.includes(token.toLowerCase()));
};

const buildLoginErrorMessage = (error) => String(error?.message || 'Session validation failed.');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = {
  readXCredentials,
  parseXSessionError,
  buildLoginErrorMessage,
  sleep,
};
