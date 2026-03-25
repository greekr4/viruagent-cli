const readRedditCredentials = () => {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const username = process.env.REDDIT_USERNAME;
  const password = process.env.REDDIT_PASSWORD;
  const env = (v) => typeof v === 'string' && v.trim() ? v.trim() : null;
  return {
    clientId: env(clientId),
    clientSecret: env(clientSecret),
    username: env(username),
    password: env(password),
    hasOAuth: Boolean(env(clientId) && env(clientSecret)),
    hasPassword: Boolean(env(username) && env(password)),
  };
};

const parseRedditSessionError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return [
    'no session file found',
    'no valid token in session',
    'session expired',
    'authentication error',
    'token expired',
    'unauthorized',
    '401',
    '403',
  ].some((token) => message.includes(token.toLowerCase()));
};

const buildLoginErrorMessage = (error) => String(error?.message || 'Session validation failed.');

const parseRedditError = (data) => {
  if (data?.json?.errors?.length) {
    const [code, message] = data.json.errors[0];
    return { ok: false, error: code, message, hint: `Reddit API error: ${code}` };
  }
  if (data?.error) {
    return { ok: false, error: String(data.error), message: data.message || data.error_description || '', hint: '' };
  }
  return null;
};

module.exports = {
  readRedditCredentials,
  parseRedditSessionError,
  buildLoginErrorMessage,
  parseRedditError,
};
