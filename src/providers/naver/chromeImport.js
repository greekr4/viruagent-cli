const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync, execFileSync } = require('child_process');

const NAVER_SESSION_COOKIES = ['NID_AUT', 'NID_SES'];

const decryptChromeCookieMac = (encryptedValue, derivedKey) => {
  if (!encryptedValue || encryptedValue.length < 4) return '';
  const prefix = encryptedValue.slice(0, 3).toString('ascii');
  if (prefix !== 'v10') return encryptedValue.toString('utf-8');

  const encrypted = encryptedValue.slice(3);
  const iv = Buffer.alloc(16, 0x20);
  const decipher = crypto.createDecipheriv('aes-128-cbc', derivedKey, iv);
  decipher.setAutoPadding(true);
  try {
    const dec = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    let start = dec.length;
    for (let i = dec.length - 1; i >= 0; i--) {
      if (dec[i] >= 0x20 && dec[i] <= 0x7e) { start = i; }
      else { break; }
    }
    return start < dec.length ? dec.slice(start).toString('utf-8') : '';
  } catch {
    return '';
  }
};

const getWindowsChromeMasterKey = (chromeRoot) => {
  const localStatePath = path.join(chromeRoot, 'Local State');
  if (!fs.existsSync(localStatePath)) {
    throw new Error('Chrome Local State 파일을 찾을 수 없습니다.');
  }
  const localState = JSON.parse(fs.readFileSync(localStatePath, 'utf-8'));
  const encryptedKeyB64 = localState.os_crypt && localState.os_crypt.encrypted_key;
  if (!encryptedKeyB64) {
    throw new Error('Chrome Local State에서 암호화 키를 찾을 수 없습니다.');
  }
  const encryptedKeyWithPrefix = Buffer.from(encryptedKeyB64, 'base64');
  const encryptedKey = encryptedKeyWithPrefix.slice(5);
  const encHex = encryptedKey.toString('hex');

  const psScript = `
Add-Type -AssemblyName System.Security
$encBytes = [byte[]]::new(${encryptedKey.length})
$hex = '${encHex}'
for ($i = 0; $i -lt $encBytes.Length; $i++) {
  $encBytes[$i] = [Convert]::ToByte($hex.Substring($i * 2, 2), 16)
}
$decBytes = [System.Security.Cryptography.ProtectedData]::Unprotect($encBytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
$decHex = -join ($decBytes | ForEach-Object { $_.ToString('x2') })
Write-Output $decHex
`.trim().replace(/\n/g, '; ');

  try {
    const decHex = execSync(
      `powershell -NoProfile -Command "${psScript}"`,
      { encoding: 'utf-8', timeout: 10000 }
    ).trim();
    return Buffer.from(decHex, 'hex');
  } catch {
    throw new Error('Chrome 암호화 키를 DPAPI로 복호화할 수 없습니다.');
  }
};

const decryptChromeCookieWindows = (encryptedValue, masterKey) => {
  if (!encryptedValue || encryptedValue.length < 4) return '';
  const prefix = encryptedValue.slice(0, 3).toString('ascii');
  if (prefix !== 'v10' && prefix !== 'v20') return encryptedValue.toString('utf-8');

  const nonce = encryptedValue.slice(3, 3 + 12);
  const authTag = encryptedValue.slice(encryptedValue.length - 16);
  const ciphertext = encryptedValue.slice(3 + 12, encryptedValue.length - 16);

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, nonce);
    decipher.setAuthTag(authTag);
    const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return dec.toString('utf-8');
  } catch {
    return '';
  }
};

const decryptChromeCookie = (encryptedValue, key) => {
  if (process.platform === 'win32') {
    return decryptChromeCookieWindows(encryptedValue, key);
  }
  return decryptChromeCookieMac(encryptedValue, key);
};

const extractChromeCookies = (cookiesDb, derivedKey, domainPattern) => {
  const tempDb = path.join(os.tmpdir(), `viruagent-naver-cookies-${Date.now()}.db`);

  const backupCmd = process.platform === 'win32'
    ? `.backup "${tempDb}"`
    : `.backup '${tempDb.replace(/'/g, "''")}'`;
  try {
    execFileSync('sqlite3', [cookiesDb, backupCmd], { stdio: 'ignore', timeout: 10000 });
  } catch {
    let copied = false;
    try {
      fs.copyFileSync(cookiesDb, tempDb);
      copied = true;
    } catch {}
    if (!copied) {
      throw new Error('Chrome 쿠키 DB 복사에 실패했습니다. Chrome이 실행 중이면 종료 후 다시 시도해 주세요.');
    }
  }

  for (const suffix of ['-wal', '-shm', '-journal']) {
    try { fs.unlinkSync(tempDb + suffix); } catch {}
  }

  try {
    const query = `SELECT host_key, name, value, hex(encrypted_value), path, expires_utc, is_secure, is_httponly, samesite FROM cookies WHERE host_key LIKE '${domainPattern}'`;
    const rows = execFileSync('sqlite3', ['-separator', '||', tempDb, query], {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    if (!rows) return [];

    const chromeEpochOffset = 11644473600;
    const sameSiteMap = { '-1': 'None', '0': 'None', '1': 'Lax', '2': 'Strict' };
    return rows.split('\n').map((row) => {
      const [domain, name, plainValue, encHex, cookiePath, expiresUtc, isSecure, isHttpOnly, sameSite] = row.split('||');
      let value = plainValue || '';
      if (!value && encHex) {
        value = decryptChromeCookie(Buffer.from(encHex, 'hex'), derivedKey);
      }
      if (value && !/^[\x20-\x7E]*$/.test(value)) value = '';
      const expires = expiresUtc === '0' ? -1 : Math.floor(Number(expiresUtc) / 1000000) - chromeEpochOffset;
      return { name, value, domain, path: cookiePath || '/', expires, httpOnly: isHttpOnly === '1', secure: isSecure === '1', sameSite: sameSiteMap[sameSite] || 'None' };
    }).filter((c) => c.value);
  } finally {
    try { fs.unlinkSync(tempDb); } catch {}
  }
};

const importSessionFromChrome = async (targetSessionPath, profileName = 'Default') => {
  let chromeRoot;
  if (process.platform === 'win32') {
    chromeRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Google', 'Chrome', 'User Data');
  } else {
    chromeRoot = path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
  }
  if (!fs.existsSync(chromeRoot)) {
    throw new Error('Chrome이 설치되어 있지 않습니다.');
  }

  const profileDir = path.join(chromeRoot, profileName);
  let cookiesDb = path.join(profileDir, 'Network', 'Cookies');
  if (!fs.existsSync(cookiesDb)) {
    cookiesDb = path.join(profileDir, 'Cookies');
  }
  if (!fs.existsSync(cookiesDb)) {
    throw new Error(`Chrome 프로필 "${profileName}"에 쿠키 DB가 없습니다.`);
  }

  let derivedKey;
  if (process.platform === 'win32') {
    derivedKey = getWindowsChromeMasterKey(chromeRoot);
  } else {
    let keychainPassword;
    try {
      keychainPassword = execSync(
        'security find-generic-password -s "Chrome Safe Storage" -w',
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();
    } catch {
      throw new Error('Chrome Safe Storage 키를 Keychain에서 읽을 수 없습니다. macOS 권한을 확인해 주세요.');
    }
    derivedKey = crypto.pbkdf2Sync(keychainPassword, 'saltysalt', 1003, 16, 'sha1');
  }

  const naverCookies = extractChromeCookies(cookiesDb, derivedKey, '%naver.com');

  const hasAuth = naverCookies.some((c) => c.name === 'NID_AUT' && c.value) &&
    naverCookies.some((c) => c.name === 'NID_SES' && c.value);

  if (!hasAuth) {
    throw new Error('Chrome에 네이버 로그인 세션이 없습니다. Chrome에서 먼저 네이버에 로그인해 주세요.');
  }

  const payload = { cookies: naverCookies, updatedAt: new Date().toISOString() };
  await fs.promises.mkdir(path.dirname(targetSessionPath), { recursive: true });
  await fs.promises.writeFile(targetSessionPath, JSON.stringify(payload, null, 2), 'utf-8');
  return { cookieCount: naverCookies.length };
};

module.exports = {
  importSessionFromChrome,
};
