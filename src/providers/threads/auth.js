const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readThreadsCredentials } = require('./utils');
const { saveThreadsSession } = require('./session');

const THREADS_APP_ID = '238260118697367';
const THREADS_USER_AGENT = 'Barcelona 289.0.0.77.109 Android';
const BLOKS_VERSION = '00ba6fa565c3c707243ad976fa30a071a625f2a3d158d9412091176fe35027d8';
const BASE_URL = 'https://i.instagram.com';

const generateDeviceId = () => `android-${crypto.randomBytes(8).toString('hex')}`;

const createAskForAuthentication = ({ sessionPath }) => async ({
  username,
  password,
} = {}) => {
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });

  const resolvedUsername = username || readThreadsCredentials().username;
  const resolvedPassword = password || readThreadsCredentials().password;

  if (!resolvedUsername || !resolvedPassword) {
    throw new Error(
      'Threads login requires username/password. ' +
      'Please set the THREADS_USERNAME / THREADS_PASSWORD (or INSTA_USERNAME / INSTA_PASSWORD) environment variables.',
    );
  }

  const deviceId = generateDeviceId();
  const timestamp = Math.floor(Date.now() / 1000);

  const clientInputParams = JSON.stringify({
    password: `#PWD_INSTAGRAM:0:${timestamp}:${resolvedPassword}`,
    contact_point: resolvedUsername,
    device_id: deviceId,
  });

  const serverParams = JSON.stringify({
    credential_type: 'password',
    device_id: deviceId,
  });

  const body = new URLSearchParams({
    params: JSON.stringify({
      client_input_params: JSON.parse(clientInputParams),
      server_params: JSON.parse(serverParams),
    }),
    bk_client_context: JSON.stringify({ bloks_version: BLOKS_VERSION, styles_id: 'instagram' }),
    bloks_versioning_id: BLOKS_VERSION,
  });

  const res = await fetch(
    `${BASE_URL}/api/v1/bloks/apps/com.bloks.www.bloks.caa.login.async.send_login_request/`,
    {
      method: 'POST',
      headers: {
        'User-Agent': THREADS_USER_AGENT,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Bloks-Version-Id': BLOKS_VERSION,
        'X-IG-App-ID': THREADS_APP_ID,
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
      },
      body: body.toString(),
      redirect: 'manual',
    },
  );

  const responseText = await res.text();

  // Extract Bearer token — check header first, then Bloks response body
  let token = null;
  const authHeader = res.headers.get('ig-set-authorization');
  if (authHeader) {
    const match = authHeader.match(/Bearer IGT:2:(.+)/);
    if (match) token = match[1];
  }
  if (!token) {
    // Token is embedded in Bloks response body (escaped JSON)
    const bodyMatch = responseText.match(/Bearer IGT:2:([a-zA-Z0-9_=+/]+)/);
    if (bodyMatch) token = bodyMatch[1];
  }

  // Extract userId from token (base64 decode) or response body
  let userId = null;
  if (token) {
    try {
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
      userId = decoded.ds_user_id || null;
    } catch { /* ignore decode error */ }
  }
  if (!userId) {
    const userIdMatch = responseText.match(/"pk_string":"(\d+)"/);
    if (userIdMatch) {
      userId = userIdMatch[1];
    } else {
      const altMatch = responseText.match(/"user_id":(\d+)/);
      if (altMatch) userId = altMatch[1];
    }
  }

  // Check for errors
  if (!token) {
    if (responseText.includes('checkpoint_required') || responseText.includes('challenge_required')) {
      throw new Error(
        'challenge_required: Identity verification required. Please complete it in the Threads app or Instagram.',
      );
    }
    if (responseText.includes('two_factor_required')) {
      throw new Error(
        'Two-factor authentication (2FA) is required. Please complete verification in the app first.',
      );
    }
    if (responseText.includes('invalid_user') || responseText.includes('invalid_password')) {
      throw new Error('Threads login failed: Invalid username or password.');
    }
    throw new Error(
      `Threads login failed: Could not extract authorization token. Response status: ${res.status}`,
    );
  }

  // Save session
  saveThreadsSession(sessionPath, { token, userId, deviceId });

  return {
    provider: 'threads',
    loggedIn: true,
    userId,
    username: resolvedUsername,
    sessionPath,
  };
};

module.exports = {
  createAskForAuthentication,
  THREADS_APP_ID,
  THREADS_USER_AGENT,
  BLOKS_VERSION,
  BASE_URL,
};
