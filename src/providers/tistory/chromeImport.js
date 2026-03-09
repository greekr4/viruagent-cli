const { chromium } = require('playwright');
const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const path = require('path');
const { pickValue } = require('./browserHelpers');
const { persistTistorySession } = require('./session');
const {
  KAKAO_TRIGGER_SELECTORS,
  KAKAO_ACCOUNT_CONFIRM_SELECTORS,
} = require('./selectors');

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
    // CBC 첫 블록은 IV 불일치로 깨짐 → 끝에서부터 printable ASCII 범위 추출
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
  // 앞 5바이트 "DPAPI" 접두사 제거
  const encryptedKey = encryptedKeyWithPrefix.slice(5);
  const encHex = encryptedKey.toString('hex');

  // PowerShell DPAPI로 복호화
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

  // AES-256-GCM: nonce(12바이트) + ciphertext + authTag(16바이트)
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

const copyFileViaVSS = (srcPath, destPath) => {
  const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'vss-copy.ps1');
  if (!fs.existsSync(scriptPath)) return false;
  try {
    const result = execSync(
      'powershell -NoProfile -ExecutionPolicy Bypass -File "' + scriptPath + '" -SourcePath "' + srcPath + '" -DestPath "' + destPath + '"',
      { encoding: 'utf-8', timeout: 30000 }
    ).trim();
    return result.includes('OK');
  } catch {
    return false;
  }
};

const isChromeRunning = () => {
  try {
    if (process.platform === 'win32') {
      const result = execSync('tasklist /FI "IMAGENAME eq chrome.exe" /NH', { encoding: 'utf-8', timeout: 5000 });
      return result.includes('chrome.exe');
    }
    const result = execSync('pgrep -x "Google Chrome" 2>/dev/null || pgrep -x chrome 2>/dev/null', { encoding: 'utf-8', timeout: 5000 });
    return result.trim().length > 0;
  } catch {
    return false;
  }
};

const extractChromeCookies = (cookiesDb, derivedKey, domainPattern) => {
  const tempDb = path.join(os.tmpdir(), `viruagent-cookies-${Date.now()}.db`);

  // SQLite 온라인 백업 API 사용 (Chrome이 실행 중이어도 동작)
  // execFileSync로 쉘을 거치지 않아 Windows 경로 공백/이스케이핑 문제 없음
  const backupCmd = process.platform === 'win32'
    ? `.backup "${tempDb}"`
    : `.backup '${tempDb.replace(/'/g, "''")}'`;
  try {
    execFileSync('sqlite3', [cookiesDb, backupCmd], { stdio: 'ignore', timeout: 10000 });
  } catch {
    // sqlite3 백업 실패 시 파일 복사 → VSS 순으로 폴백
    let copied = false;
    try {
      fs.copyFileSync(cookiesDb, tempDb);
      copied = true;
    } catch {}
    if (!copied && process.platform === 'win32') {
      // Windows: VSS(Volume Shadow Copy)로 잠긴 파일 복사
      copied = copyFileViaVSS(cookiesDb, tempDb);
    }
    if (!copied) {
      throw new Error('Chrome 쿠키 DB 복사에 실패했습니다. Chrome이 실행 중이면 종료 후 다시 시도해 주세요.');
    }
  }

  // 백업 후 남은 WAL/SHM 파일 제거 (깨끗한 DB 보장)
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
    return rows.split('\n').map(row => {
      const [domain, name, plainValue, encHex, cookiePath, expiresUtc, isSecure, isHttpOnly, sameSite] = row.split('||');
      let value = plainValue || '';
      if (!value && encHex) {
        value = decryptChromeCookie(Buffer.from(encHex, 'hex'), derivedKey);
      }
      if (value && !/^[\x20-\x7E]*$/.test(value)) value = '';
      const expires = expiresUtc === '0' ? -1 : Math.floor(Number(expiresUtc) / 1000000) - chromeEpochOffset;
      return { name, value, domain, path: cookiePath || '/', expires, httpOnly: isHttpOnly === '1', secure: isSecure === '1', sameSite: sameSiteMap[sameSite] || 'None' };
    }).filter(c => c.value);
  } finally {
    try { fs.unlinkSync(tempDb); } catch {}
  }
};

const findWindowsChromePath = () => {
  const candidates = [
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['PROGRAMFILES'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['LOCALAPPDATA'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
};

const generateSelfSignedCert = (domain) => {
  const tempDir = path.join(os.tmpdir(), `viruagent-cert-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const keyPath = path.join(tempDir, 'key.pem');
  const certPath = path.join(tempDir, 'cert.pem');

  // openssl (Git for Windows에 포함)
  const opensslPaths = [
    'openssl',
    'C:/Program Files/Git/usr/bin/openssl.exe',
    'C:/Program Files (x86)/Git/usr/bin/openssl.exe',
  ];
  let generated = false;
  for (const openssl of opensslPaths) {
    try {
      execSync(
        `"${openssl}" req -x509 -newkey rsa:2048 -nodes -keyout "${keyPath}" -out "${certPath}" -days 1 -subj "/CN=${domain}"`,
        { timeout: 10000, stdio: 'pipe' }
      );
      generated = true;
      break;
    } catch {}
  }
  if (!generated) {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    return null;
  }
  return { keyPath, certPath, tempDir };
};

const CDP_DEBUG_PORT = 9222;

const tryConnectCDP = async (port) => {
  const http = require('http');
  return new Promise((resolve) => {
    http.get(`http://127.0.0.1:${port}/json/version`, { timeout: 2000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const info = JSON.parse(data);
          resolve(info.webSocketDebuggerUrl || null);
        } catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
};

const findChromeDebugPort = async () => {
  // 1. 고정 포트 9222 시도
  const ws = await tryConnectCDP(CDP_DEBUG_PORT);
  if (ws) return { port: CDP_DEBUG_PORT, wsUrl: ws };

  // 2. DevToolsActivePort 파일 확인
  const dtpPath = path.join(
    process.env.LOCALAPPDATA || '',
    'Google', 'Chrome', 'User Data', 'DevToolsActivePort'
  );
  try {
    const content = fs.readFileSync(dtpPath, 'utf-8').trim();
    const port = parseInt(content.split('\n')[0], 10);
    if (port > 0) {
      const ws2 = await tryConnectCDP(port);
      if (ws2) return { port, wsUrl: ws2 };
    }
  } catch {}

  return null;
};

const enableChromeDebugPort = () => {
  // Chrome 바로가기에 --remote-debugging-port 추가 (한 번만 실행)
  if (process.platform !== 'win32') return false;

  const flag = `--remote-debugging-port=${CDP_DEBUG_PORT}`;
  const shortcutPaths = [];

  // 바탕화면, 시작 메뉴, 작업표시줄 바로가기 검색
  const locations = [
    path.join(os.homedir(), 'Desktop'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar'),
    'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs',
  ];
  for (const loc of locations) {
    try {
      const files = fs.readdirSync(loc);
      for (const f of files) {
        if (/chrome/i.test(f) && f.endsWith('.lnk')) {
          shortcutPaths.push(path.join(loc, f));
        }
      }
    } catch {}
  }
  // Google Chrome 폴더 내부도 탐색
  for (const loc of locations) {
    try {
      const chromeDir = path.join(loc, 'Google Chrome');
      if (fs.existsSync(chromeDir)) {
        const files = fs.readdirSync(chromeDir);
        for (const f of files) {
          if (/chrome/i.test(f) && f.endsWith('.lnk')) {
            shortcutPaths.push(path.join(chromeDir, f));
          }
        }
      }
    } catch {}
  }

  let modified = 0;
  for (const lnkPath of shortcutPaths) {
    try {
      const psScript = `
$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut('${lnkPath.replace(/'/g, "''")}')
if ($sc.Arguments -notmatch 'remote-debugging-port') {
  $sc.Arguments = ($sc.Arguments + ' ${flag}').Trim()
  $sc.Save()
  Write-Output 'MODIFIED'
} else {
  Write-Output 'ALREADY'
}`;
      const result = execSync(`powershell -Command "${psScript.replace(/"/g, '\\"')}"`, {
        timeout: 5000,
        encoding: 'utf-8',
      }).trim();
      if (result === 'MODIFIED') modified++;
    } catch {}
  }
  return modified > 0;
};

const extractCookiesFromCDP = async (port, targetSessionPath) => {
  const http = require('http');
  const WebSocket = require('ws');

  // 1. 브라우저 레벨 CDP에 연결하여 tistory 탭 생성/탐색
  const browserWsUrl = await tryConnectCDP(port);
  if (!browserWsUrl) throw new Error('Chrome CDP 연결 실패');

  // 2. 기존 tistory 탭 찾거나 새로 생성
  const targetsJson = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/json/list`, { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
  const targets = JSON.parse(targetsJson);
  let pageTarget = targets.find(t => t.type === 'page' && t.url && t.url.includes('tistory'));

  if (!pageTarget) {
    // tistory 탭이 없으면 브라우저 CDP로 새 탭 생성
    const bws = new WebSocket(browserWsUrl);
    const newTargetId = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('탭 생성 시간 초과')), 10000);
      bws.on('open', () => {
        bws.send(JSON.stringify({ id: 1, method: 'Target.createTarget', params: { url: 'https://www.tistory.com/' } }));
      });
      bws.on('message', (msg) => {
        const resp = JSON.parse(msg.toString());
        if (resp.id === 1) {
          clearTimeout(timeout);
          resolve(resp.result?.targetId);
          bws.close();
        }
      });
      bws.on('error', (e) => { clearTimeout(timeout); reject(e); });
    });
    // 새 탭의 WebSocket URL 조회
    await new Promise(r => setTimeout(r, 3000));
    const newTargetsJson = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/json/list`, { timeout: 3000 }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
    const newTargets = JSON.parse(newTargetsJson);
    pageTarget = newTargets.find(t => t.id === newTargetId) || newTargets.find(t => t.type === 'page' && t.url && t.url.includes('tistory'));
  }

  if (!pageTarget || !pageTarget.webSocketDebuggerUrl) {
    throw new Error('tistory 페이지 타겟을 찾을 수 없습니다.');
  }

  // 3. 페이지 레벨 CDP에서 Network.enable → Network.getAllCookies
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  const cookies = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('CDP 쿠키 추출 시간 초과')), 15000);
    let msgId = 1;
    ws.on('open', () => {
      ws.send(JSON.stringify({ id: msgId++, method: 'Network.enable' }));
    });
    ws.on('message', (msg) => {
      const resp = JSON.parse(msg.toString());
      if (resp.id === 1) {
        // Network enabled → getAllCookies
        ws.send(JSON.stringify({ id: msgId++, method: 'Network.getAllCookies' }));
      }
      if (resp.id === 2) {
        clearTimeout(timeout);
        resolve(resp.result?.cookies || []);
        ws.close();
      }
    });
    ws.on('error', (e) => { clearTimeout(timeout); reject(e); });
  });

  const tistoryCookies = cookies.filter(c => String(c.domain).includes('tistory'));
  const tssession = tistoryCookies.find(c => c.name === 'TSSESSION');
  if (!tssession || !tssession.value) {
    throw new Error('Chrome에 티스토리 로그인 세션이 없습니다. Chrome에서 먼저 티스토리에 로그인해 주세요.');
  }

  const payload = {
    cookies: tistoryCookies.map(c => ({
      name: c.name, value: c.value, domain: c.domain,
      path: c.path || '/', expires: c.expires > 0 ? c.expires : -1,
      httpOnly: !!c.httpOnly, secure: !!c.secure,
      sameSite: c.sameSite || 'None',
    })),
    updatedAt: new Date().toISOString(),
  };
  await fs.promises.mkdir(path.dirname(targetSessionPath), { recursive: true });
  await fs.promises.writeFile(targetSessionPath, JSON.stringify(payload, null, 2), 'utf-8');
  return { cookieCount: tistoryCookies.length };
};

const getOrCreateJunctionPath = (chromeRoot) => {
  // Chrome 145+: 기본 user-data-dir에서는 --remote-debugging-port가 작동하지 않음
  // Junction point로 같은 디렉토리를 다른 경로로 가리켜서 우회
  if (process.platform !== 'win32') return chromeRoot;

  const junctionPath = path.join(path.dirname(chromeRoot), 'ChromeDebug');
  if (!fs.existsSync(junctionPath)) {
    try {
      execSync(`cmd /c "mklink /J "${junctionPath}" "${chromeRoot}""`, {
        timeout: 5000, stdio: 'pipe',
      });
    } catch {
      // Junction 생성 실패 시 원본 경로 사용 (디버그 포트 작동 안 할 수 있음)
      return chromeRoot;
    }
  }
  return junctionPath;
};

const extractCookiesViaCDP = async (targetSessionPath, chromeRoot, profileName) => {
  // Chrome 실행 중: CDP(Chrome DevTools Protocol)로 쿠키 추출
  // 1단계: 이미 디버그 포트가 열려있으면 바로 연결 (크롬 종료 없음)
  // 2단계: 없으면 한 번만 재시작 + 바로가기 수정 (이후 재시작 불필요)
  const { spawn } = require('child_process');

  // 1. 이미 디버그 포트가 열려있는지 확인
  const existing = await findChromeDebugPort();
  if (existing) {
    console.log(`[chrome-cdp] 기존 Chrome 디버그 포트(${existing.port}) 감지 — 크롬 종료 없이 쿠키 추출`);
    return await extractCookiesFromCDP(existing.port, targetSessionPath);
  }

  // 2. 디버그 포트 없음 → Chrome 바로가기에 디버그 포트 추가 (이후 재시작 불필요)
  console.log('[chrome-cdp] Chrome 디버그 포트 미감지 — 바로가기에 --remote-debugging-port 추가 중...');
  const shortcutModified = enableChromeDebugPort();
  if (shortcutModified) {
    console.log('[chrome-cdp] Chrome 바로가기 수정 완료 — 다음부터는 크롬 종료 없이 쿠키 추출 가능');
  }

  // 3. Chrome을 graceful하게 종료하고 디버그 포트로 재시작 (최초 1회만)
  const chromePath = findWindowsChromePath();
  if (!chromePath) throw new Error('Chrome 실행 파일을 찾을 수 없습니다.');

  console.log('[chrome-cdp] Chrome을 디버그 포트와 함께 재시작합니다 (탭 자동 복원)...');
  try {
    if (process.platform === 'win32') {
      execSync('cmd /c "taskkill /IM chrome.exe"', { stdio: 'ignore', timeout: 10000 });
    }
  } catch {}
  await new Promise(r => setTimeout(r, 2000));
  if (isChromeRunning()) {
    try { execSync('cmd /c "taskkill /F /IM chrome.exe"', { stdio: 'ignore', timeout: 5000 }); } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }

  // 4. Junction 경로로 디버그 포트 + 세션 복원 재시작
  //    Chrome 145+는 기본 user-data-dir에서 디버그 포트를 거부하므로 junction으로 우회
  const junctionRoot = getOrCreateJunctionPath(chromeRoot);
  const chromeProc = spawn(chromePath, [
    `--remote-debugging-port=${CDP_DEBUG_PORT}`,
    '--remote-allow-origins=*',
    '--restore-last-session',
    `--user-data-dir=${junctionRoot}`,
    `--profile-directory=${profileName}`,
  ], { detached: true, stdio: 'ignore' });
  chromeProc.unref();

  // 5. CDP 연결 대기
  let connected = null;
  const maxWait = 15000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 500));
    connected = await findChromeDebugPort();
    if (connected) break;
  }
  if (!connected) throw new Error('Chrome 디버그 포트 연결 시간 초과');

  // 6. 쿠키 추출 (Chrome은 계속 실행 상태 유지 — 종료하지 않음)
  return await extractCookiesFromCDP(connected.port, targetSessionPath);
};

const importSessionViaChromeDirectLaunch = async (targetSessionPath, chromeRoot, profileName) => {
  // Windows Chrome 145+: v20 App Bound Encryption으로 외부에서 쿠키 복호화 불가
  // Chrome 실행 중이면 CDP 방식으로 추출 (잠시 재시작, 탭 자동 복원)
  if (isChromeRunning()) {
    return await extractCookiesViaCDP(targetSessionPath, chromeRoot, profileName);
  }

  const chromePath = findWindowsChromePath();
  if (!chromePath) {
    throw new Error('Chrome 실행 파일을 찾을 수 없습니다.');
  }

  // 1. 자체 서명 인증서 생성 (openssl 필요)
  const cert = generateSelfSignedCert('www.tistory.com');
  if (!cert) {
    throw new Error(
      'openssl을 찾을 수 없습니다. Git for Windows를 설치하면 openssl이 포함됩니다.'
    );
  }

  const https = require('https');
  const { spawn } = require('child_process');

  // 2. HTTPS 서버 시작 (포트 443)
  const server = https.createServer({
    key: fs.readFileSync(cert.keyPath),
    cert: fs.readFileSync(cert.certPath),
  });

  try {
    await new Promise((resolve, reject) => {
      server.on('error', reject);
      server.listen(443, '127.0.0.1', resolve);
    });
  } catch (e) {
    try { fs.rmSync(cert.tempDir, { recursive: true, force: true }); } catch {}
    throw new Error(`포트 443 바인딩 실패: ${e.message}. 관리자 권한으로 실행해 주세요.`);
  }

  // 3. 쿠키 수신 Promise
  let chromeProc = null;
  const cookiePromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Chrome 쿠키 추출 시간 초과 (15초)'));
    }, 15000);

    server.on('request', (req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body>Session captured. You can close this window.</body></html>');

      if (req.url === '/' || req.url === '') {
        clearTimeout(timeout);
        const cookieHeader = req.headers.cookie || '';
        resolve(cookieHeader);
      }
    });
  });

  // 4. Chrome 실행 (Chrome이 꺼진 상태에서만 실행됨 - DNS 리다이렉션, 인증서 오류 무시)
  chromeProc = spawn(chromePath, [
    '--no-first-run',
    '--no-default-browser-check',
    `--profile-directory=${profileName}`,
    '--host-resolver-rules=MAP www.tistory.com 127.0.0.1',
    '--ignore-certificate-errors',
    'https://www.tistory.com/',
  ], { detached: true, stdio: 'ignore' });
  chromeProc.unref();

  try {
    const cookieHeader = await cookiePromise;

    // Cookie 헤더 파싱
    const cookies = cookieHeader.split(';')
      .map(c => c.trim())
      .filter(Boolean)
      .map(c => {
        const eqIdx = c.indexOf('=');
        if (eqIdx < 0) return null;
        return { name: c.slice(0, eqIdx).trim(), value: c.slice(eqIdx + 1).trim() };
      })
      .filter(Boolean);

    const tssession = cookies.find(c => c.name === 'TSSESSION');
    if (!tssession || !tssession.value) {
      throw new Error(
        'Chrome에 티스토리 로그인 세션이 없습니다. Chrome에서 먼저 티스토리에 로그인해 주세요.'
      );
    }

    // Cookie 헤더에는 domain/path/expires 정보가 없으므로 기본값 설정
    const payload = {
      cookies: cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: '.tistory.com',
        path: '/',
        expires: -1,
        httpOnly: false,
        secure: true,
        sameSite: 'None',
      })),
      updatedAt: new Date().toISOString(),
    };

    await fs.promises.mkdir(path.dirname(targetSessionPath), { recursive: true });
    await fs.promises.writeFile(targetSessionPath, JSON.stringify(payload, null, 2), 'utf-8');

    return { cookieCount: cookies.length };
  } finally {
    server.close();
    if (chromeProc) {
      try { execSync(`taskkill /F /PID ${chromeProc.pid} /T`, { stdio: 'ignore', timeout: 5000 }); } catch {}
    }
    try { fs.rmSync(cert.tempDir, { recursive: true, force: true }); } catch {}
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
  // Windows 최신 Chrome은 Network/Cookies, 이전 버전은 Cookies
  let cookiesDb = path.join(profileDir, 'Network', 'Cookies');
  if (!fs.existsSync(cookiesDb)) {
    cookiesDb = path.join(profileDir, 'Cookies');
  }
  if (!fs.existsSync(cookiesDb)) {
    throw new Error(`Chrome 프로필 "${profileName}"에 쿠키 DB가 없습니다.`);
  }

  let derivedKey;
  if (process.platform === 'win32') {
    // Windows: Local State → DPAPI로 마스터 키 복호화
    derivedKey = getWindowsChromeMasterKey(chromeRoot);
  } else {
    // macOS: Keychain에서 Chrome 암호화 키 추출
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

  // Chrome에서 tistory + kakao 쿠키 복호화 추출
  const tistoryCookies = extractChromeCookies(cookiesDb, derivedKey, '%tistory.com');
  const kakaoCookies = extractChromeCookies(cookiesDb, derivedKey, '%kakao.com');

  // 이미 TSSESSION 있으면 바로 저장
  const existingSession = tistoryCookies.some(c => c.name === 'TSSESSION' && c.value);
  if (existingSession) {
    const payload = { cookies: tistoryCookies, updatedAt: new Date().toISOString() };
    await fs.promises.mkdir(path.dirname(targetSessionPath), { recursive: true });
    await fs.promises.writeFile(targetSessionPath, JSON.stringify(payload, null, 2), 'utf-8');
    return { cookieCount: tistoryCookies.length };
  }

  // 3) 카카오 세션 쿠키가 있으면 Playwright에 주입 후 자동 로그인
  const hasKakaoSession = kakaoCookies.some(c => c.domain.includes('kakao.com') && (c.name === '_kawlt' || c.name === '_kawltea' || c.name === '_karmt'));
  if (!hasKakaoSession) {
    // Windows v20 App Bound Encryption: DPAPI만으로 복호화 불가
    // Playwright persistent context (pipe 모드)로 Chrome 기본 프로필에서 직접 추출
    if (process.platform === 'win32') {
      return await importSessionViaChromeDirectLaunch(targetSessionPath, chromeRoot, profileName);
    }
    throw new Error('Chrome에 카카오 로그인 세션이 없습니다. Chrome에서 먼저 카카오 계정에 로그인해 주세요.');
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  try {
    // Playwright 형식으로 변환하여 쿠키 주입
    const allCookies = [...tistoryCookies, ...kakaoCookies].map(c => ({
      ...c,
      domain: c.domain.startsWith('.') ? c.domain : c.domain,
      expires: c.expires > 0 ? c.expires : undefined,
    }));
    await context.addCookies(allCookies);

    const page = await context.newPage();
    await page.goto('https://www.tistory.com/auth/login', { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(1000);

    // 카카오 로그인 버튼 클릭
    const kakaoBtn = await pickValue(page, KAKAO_TRIGGER_SELECTORS);
    if (kakaoBtn) {
      await page.locator(kakaoBtn).click({ timeout: 5000 }).catch(() => {});
      await page.waitForLoadState('domcontentloaded').catch(() => {});
    }

    // 카카오 계정 확인 → 계속하기 클릭
    await page.waitForTimeout(2000);
    const confirmBtn = await pickValue(page, [
      ...KAKAO_ACCOUNT_CONFIRM_SELECTORS.continue,
      'button[type="submit"]',
    ]);
    if (confirmBtn) {
      await page.locator(confirmBtn).click({ timeout: 3000 }).catch(() => {});
    }

    // TSSESSION 대기 (최대 15초)
    let hasSession = false;
    const maxWait = 15000;
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
      await page.waitForTimeout(1000);
      const cookies = await context.cookies('https://www.tistory.com');
      hasSession = cookies.some(c => c.name === 'TSSESSION' && c.value);
      if (hasSession) break;
    }

    if (!hasSession) {
      throw new Error('Chrome 카카오 세션으로 티스토리 자동 로그인에 실패했습니다.');
    }

    await persistTistorySession(context, targetSessionPath);
    const finalCookies = await context.cookies('https://www.tistory.com');
    return { cookieCount: finalCookies.filter(c => String(c.domain).includes('tistory')).length };
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
};

module.exports = {
  importSessionFromChrome,
};
