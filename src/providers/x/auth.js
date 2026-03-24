const { readXCredentials } = require('./utils');
const { saveXSession } = require('./session');

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
const BEARER_TOKEN = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs=1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

const createSetCredentials = ({ sessionPath }) => async ({
  authToken,
  ct0,
} = {}) => {
  const creds = readXCredentials();
  const resolvedAuthToken = authToken || creds.authToken;
  const resolvedCt0 = ct0 || creds.ct0;

  if (!resolvedAuthToken || !resolvedCt0) {
    throw new Error(
      'X login requires auth_token and ct0 cookies. ' +
      'Please set X_AUTH_TOKEN / X_CT0 environment variables, ' +
      'or provide them via --auth-token / --ct0 flags.',
    );
  }

  const cookies = [
    { name: 'auth_token', value: resolvedAuthToken, domain: '.x.com', path: '/' },
    { name: 'ct0', value: resolvedCt0, domain: '.x.com', path: '/' },
  ];

  // Verify the cookies work by calling Viewer query
  const { getOperation } = require('./graphqlSync');
  const op = await getOperation('Viewer');

  const features = {};
  for (const f of op.featureSwitches) features[f] = true;
  const fieldToggles = {};
  for (const f of op.fieldToggles) fieldToggles[f] = true;

  const params = new URLSearchParams({
    variables: JSON.stringify({}),
    features: JSON.stringify(features),
    fieldToggles: JSON.stringify(fieldToggles),
  });

  const res = await fetch(
    `https://x.com/i/api/graphql/${op.queryId}/Viewer?${params}`,
    {
      headers: {
        'User-Agent': USER_AGENT,
        Authorization: `Bearer ${BEARER_TOKEN}`,
        'x-csrf-token': resolvedCt0,
        'x-twitter-auth-type': 'OAuth2Session',
        'x-twitter-active-user': 'yes',
        'x-twitter-client-language': 'ko',
        Cookie: `auth_token=${resolvedAuthToken}; ct0=${resolvedCt0}`,
      },
    },
  );

  if (res.status === 401 || res.status === 403) {
    throw new Error(`Authentication failed (${res.status}). Please check your auth_token and ct0 cookies.`);
  }

  const data = await res.json();
  const viewer = data?.data?.viewer;
  const userResult = viewer?.user_results?.result;
  const username = userResult?.core?.screen_name
    || userResult?.legacy?.screen_name
    || null;

  if (!username) {
    throw new Error('Failed to verify X session. The cookies may be expired.');
  }

  saveXSession(sessionPath, cookies);

  return {
    provider: 'x',
    loggedIn: true,
    username,
    sessionPath,
  };
};

module.exports = {
  createSetCredentials,
  USER_AGENT,
  BEARER_TOKEN,
};
