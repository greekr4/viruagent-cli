const { exec } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require('playwright');

const CHROME_PROFILE_DIR = path.join(os.homedir(), '.viruagent-cli', 'chrome-profile');
const CDP_PORT = 9224;

// openchrome uses port 9222 and keeps an always-on Chrome with existing sessions.
// If installed, login requires no 2FA and reuses your browser's saved accounts.
// Install: npx openchrome-mcp setup
const OPENCHROME_PORT = 9222;
const OPENCHROME_PROFILE = path.join(os.homedir(), '.openchrome', 'profile');

const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
];

function findChrome() {
  for (const p of CHROME_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Google Chrome not found. Please install Chrome and try again.');
}

function isCDPAvailable(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/json/version`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => { req.destroy(); resolve(false); });
  });
}

function isOpenChromeInstalled() {
  return fs.existsSync(OPENCHROME_PROFILE);
}

/**
 * Resolve the best available Chrome CDP port.
 *
 * Priority:
 *   1. openchrome (port 9222) — already running with saved sessions, no 2FA needed.
 *   2. openchrome installed → start it via `npx openchrome-mcp serve`.
 *   3. Fallback: launch our own Chrome with a dedicated profile (first-time login requires 2FA).
 *
 * TIP: Install openchrome for a seamless login experience (no 2FA, sessions persist).
 *      → npx openchrome-mcp setup
 */
async function resolveChromeCDP(ownProfileDir = CHROME_PROFILE_DIR) {
  // 1. openchrome already running
  if (await isCDPAvailable(OPENCHROME_PORT)) {
    return { port: OPENCHROME_PORT, source: 'openchrome' };
  }

  // 2. openchrome installed but Chrome not running → launch Chrome with openchrome profile
  if (isOpenChromeInstalled()) {
    console.error('[viruagent] Launching Chrome with openchrome profile...');
    const chrome = findChrome();
    // Use same flags as openchrome to ensure stability
    const child = exec(`"${chrome}" \
      --remote-debugging-port=${OPENCHROME_PORT} \
      --user-data-dir="${OPENCHROME_PROFILE}" \
      --no-first-run \
      --no-default-browser-check \
      --no-restore-last-session \
      --start-maximized \
      --disable-backgrounding-occluded-windows \
      --disable-blink-features=AutomationControlled \
      --disable-background-networking \
      --disable-sync \
      --disable-translate \
      about:blank`);
    child.unref();
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await isCDPAvailable(OPENCHROME_PORT)) {
        console.error('[viruagent] openchrome Chrome ready.');
        return { port: OPENCHROME_PORT, source: 'openchrome' };
      }
    }
    // failed — fall through to own Chrome
  }

  // 3. Fallback: our own Chrome with dedicated profile
  // Kill any stale Chrome on CDP_PORT first to ensure correct profile is used
  const chrome = findChrome();
  fs.mkdirSync(ownProfileDir, { recursive: true });

  exec(`"${chrome}" \
    --remote-debugging-port=${CDP_PORT} \
    --user-data-dir="${ownProfileDir}" \
    --no-first-run \
    --no-default-browser-check \
    --disable-sync \
    --disable-background-networking`);

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isCDPAvailable(CDP_PORT)) {
      return { port: CDP_PORT, source: 'own' };
    }
  }

  throw new Error('Chrome failed to start. Please check your Chrome installation.');
}

async function launchChrome(ownProfileDir = CHROME_PROFILE_DIR) {
  const { port, source } = await resolveChromeCDP(ownProfileDir);

  if (source === 'own') {
    console.error(
      '\n[TIP] Install openchrome for seamless logins (no 2FA, sessions always persist):\n' +
      '       npx openchrome-mcp setup\n'
    );
  }

  return port;
}

async function connectChrome(port) {
  // Retry a few times — Chrome may need a moment after launch before contexts are ready
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
      const context = browser.contexts()[0];
      if (!context) {
        await browser.close().catch(() => {});
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      const page = context.pages()[0] || (await context.newPage());
      return { browser, context, page };
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error('Failed to connect to Chrome. Please try again.');
}

/**
 * Extract ALL cookies including httpOnly via CDP Network.getAllCookies.
 * Unlike context.cookies(), this bypasses the JS sandbox restriction.
 */
async function extractAllCookies(context, page) {
  const cdp = await context.newCDPSession(page);
  const { cookies } = await cdp.send('Network.getAllCookies');
  return cookies;
}

function filterCookies(cookies, domains) {
  return cookies.filter((c) => domains.some((d) => c.domain.includes(d)));
}

function cookiesToSessionFormat(cookies) {
  return cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path || '/',
    expires: typeof c.expires === 'number' ? c.expires : -1,
    httpOnly: c.httpOnly || false,
    secure: c.secure || false,
    sameSite: c.sameSite || 'Lax',
  }));
}

module.exports = {
  CHROME_PROFILE_DIR,
  CDP_PORT,
  OPENCHROME_PORT,
  launchChrome,
  connectChrome,
  isCDPAvailable,
  isOpenChromeInstalled,
  extractAllCookies,
  filterCookies,
  cookiesToSessionFormat,
};
