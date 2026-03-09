const { chromium } = require('playwright');
const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const readline = require('readline');
const path = require('path');
const { saveProviderMeta, clearProviderMeta, getProviderMeta } = require('../storage/sessionStore');
const createTistoryApiClient = require('../services/tistoryApiClient');
const IMAGE_TRACE_ENABLED = process.env.VIRUAGENT_IMAGE_TRACE === '1';

const imageTrace = (message, data) => {
  if (!IMAGE_TRACE_ENABLED) {
    return;
  }
  if (data === undefined) {
    console.log(`[이미지 추적] ${message}`);
    return;
  }
  console.log(`[이미지 추적] ${message}`, data);
};

const LOGIN_OTP_SELECTORS = [
    'input[name*="otp"]',
    'input[placeholder*="인증"]',
    'input[autocomplete="one-time-code"]',
    'input[name*="code"]',
];

const KAKAO_TRIGGER_SELECTORS = [
  'a.link_kakao_id',
  'a:has-text("카카오계정으로 로그인")',
];

const KAKAO_LOGIN_SELECTORS = {
  username: ['input[name="loginId"]', '#loginId--1', 'input[placeholder*="카카오메일"]'],
  password: ['input[name="password"]', '#password--2', 'input[type="password"]'],
  submit: ['button[type="submit"]', 'button:has-text("로그인")', '.btn_g.highlight.submit'],
  rememberLogin: ['#saveSignedIn--4', 'input[name="saveSignedIn"]'],
};

const KAKAO_2FA_SELECTORS = {
  start: ['#tmsTwoStepVerification', '#emailTwoStepVerification'],
  emailModeButton: ['button:has-text("이메일로 인증하기")', '.link_certify'],
  codeInput: ['input[name="email_passcode"]', '#passcode--6', 'input[placeholder*="인증번호"]'],
  confirm: ['button:has-text("확인")', 'button.btn_g.submit', 'button[type="submit"]'],
  rememberDevice: ['#isRememberBrowser--5', 'input[name="isRememberBrowser"]'],
};

const KAKAO_ACCOUNT_CONFIRM_SELECTORS = {
  textMarker: [
    'text=해당 카카오 계정으로',
    'text=티스토리\n해당 카카오 계정으로',
    'text=해당 카카오계정으로 로그인',
  ],
  continue: [
    'button:has-text("계속하기")',
    'a:has-text("계속하기")',
    'button:has-text("다음")',
  ],
  otherAccount: [
    'button:has-text("다른 카카오계정으로 로그인")',
    'a:has-text("다른 카카오계정으로 로그인")',
  ],
};

const MAX_IMAGE_UPLOAD_COUNT = 1;
const readCredentialsFromEnv = () => {
  const username = process.env.TISTORY_USERNAME || process.env.TISTORY_USER || process.env.TISTORY_ID;
  const password = process.env.TISTORY_PASSWORD || process.env.TISTORY_PW;
  return {
    username: typeof username === 'string' && username.trim() ? username.trim() : null,
    password: typeof password === 'string' && password.trim() ? password.trim() : null,
  };
};

const mapVisibility = (visibility) => {
  const normalized = String(visibility || 'public').toLowerCase();
  if (Number.isFinite(Number(visibility)) && [0, 15, 20].includes(Number(visibility))) {
    return Number(visibility);
  }
  if (normalized === 'private') return 0;
  if (normalized === 'protected') return 15;
  return 20;
};

const normalizeTagList = (value = '') => {
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

const parseSessionError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return [
    '세션이 만료',
    '세션에 유효한 쿠키',
    '세션 파일이 없습니다',
    '블로그 정보 조회 실패: 401',
    '블로그 정보 조회 실패: 403',
    '세션이 만료되었습니다',
    '다시 로그인',
  ].some((token) => message.includes(token.toLowerCase()));
};

const buildLoginErrorMessage = (error) => String(error?.message || '세션 검증에 실패했습니다.');

const promptCategorySelection = async (categories = []) => {
  if (!process.stdin || !process.stdin.isTTY) {
    return null;
  }
  if (!Array.isArray(categories) || categories.length === 0) {
    return null;
  }

  const candidates = categories.map((category, index) => `${index + 1}. ${category.name} (${category.id})`);
  const lines = [
    '발행할 카테고리를 선택해 주세요.',
    ...candidates,
    `입력: 번호(1-${categories.length}) 또는 카테고리 ID (엔터 입력 시 건너뛰기)`,
  ];
  const prompt = `${lines.join('\n')}\n> `;

  const parseSelection = (input) => {
    const normalized = String(input || '').trim();
    if (!normalized) {
      return null;
    }

    const numeric = Number(normalized);
    if (Number.isInteger(numeric) && numeric > 0) {
      if (numeric <= categories.length) {
        return Number(categories[numeric - 1].id);
      }
      const matchedById = categories.find((item) => Number(item.id) === numeric);
      if (matchedById) {
        return Number(matchedById.id);
      }
    }

    return null;
  };

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const ask = (retryCount = 0) => {
      rl.question(prompt, (input) => {
        const selectedId = parseSelection(input);
        if (selectedId) {
          rl.close();
          resolve(selectedId);
          return;
        }

        if (retryCount >= 2) {
          rl.close();
          resolve(null);
          return;
        }

        console.log('잘못된 입력입니다. 번호 또는 카테고리 ID를 다시 입력해 주세요.');
        ask(retryCount + 1);
      });
    };

    ask(0);
  });
};

const isPublishLimitError = (error) => {
  const message = String(error?.message || '');
  return /발행 실패:\s*403/.test(message) || /\b403\b/.test(message);
};

const isProvidedCategory = (value) => {
  return value !== undefined && value !== null && String(value).trim() !== '';
};

const buildCategoryList = (rawCategories) => {
  const entries = Object.entries(rawCategories || {});
  const categories = entries.map(([name, id]) => ({
    name,
    id: Number(id),
  }));
  return categories.sort((a, b) => a.id - b.id);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const pickValue = async (page, selectors) => {
  for (const selector of selectors) {
    const element = await page.$(selector);
    if (element) {
      return selector;
    }
  }
  return null;
};

const fillBySelector = async (page, selectors, value) => {
  const selector = await pickValue(page, selectors);
  if (!selector) {
    return false;
  }
  await page.locator(selector).fill(value);
  return true;
};

const clickSubmit = async (page, selectors) => {
  const selector = await pickValue(page, selectors);
  if (!selector) {
    return false;
  }
  await page.locator(selector).click({ timeout: 5000 });
  return true;
};

const checkBySelector = async (page, selectors) => {
  const selector = await pickValue(page, selectors);
  if (!selector) {
    return false;
  }
  const locator = page.locator(selector);
  const isChecked = await locator.isChecked().catch(() => false);
  if (!isChecked) {
    await locator.check({ force: true }).catch(() => {});
  }
  return true;
};

const hasElement = async (page, selectors) => {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count();
    if (count > 0) {
      return true;
    }
  }
  return false;
};

const hasKakaoAccountConfirmScreen = async (page) => {
  const url = page.url();
  const isKakaoDomain = url.includes('accounts.kakao.com') || url.includes('kauth.kakao.com');
  if (!isKakaoDomain) {
    return false;
  }

  return await hasElement(page, KAKAO_ACCOUNT_CONFIRM_SELECTORS.textMarker);
};

const clickKakaoAccountContinue = async (page) => {
  if (!(await hasKakaoAccountConfirmScreen(page))) {
    return false;
  }

  const continueSelector = await pickValue(page, KAKAO_ACCOUNT_CONFIRM_SELECTORS.continue);
  if (!continueSelector) {
    return false;
  }

  await page.locator(continueSelector).click({ timeout: 5000 });
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(800);
  return true;
};

const IMAGE_PLACEHOLDER_REGEX = /<!--\s*IMAGE:\s*([^>]*?)\s*-->/g;

const escapeRegExp = (value = '') => {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const sanitizeKeywordForFilename = (value = '') => {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 50) || 'image';
};

const normalizeTempDir = () => {
  const tmpDir = path.join(os.tmpdir(), 'viruagent-cli-images');
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
};

const buildImageFileName = (keyword, ext = 'jpg') => {
  const base = sanitizeKeywordForFilename(keyword || 'image');
  const random = crypto.randomBytes(4).toString('hex');
  return `${base}-${random}.${ext}`;
};

const buildTistoryImageTag = (uploadedImage, keyword) => {
  const alt = String(keyword || '').replace(/"/g, '&quot;');
  const normalizedKage = normalizeUploadedImageThumbnail(uploadedImage);
  if (normalizedKage) {
    return `<p data-ke-size="size16">[##_Image|${normalizedKage}|CDM|1.3|{"originWidth":0,"originHeight":0,"style":"alignCenter"}_##]</p>`;
  }
  if (uploadedImage?.uploadedKage) {
    return `<p data-ke-size="size16">[##_Image|${uploadedImage.uploadedKage}|CDM|1.3|{"originWidth":0,"originHeight":0,"style":"alignCenter"}_##]</p>`;
  }
  if (uploadedImage?.uploadedUrl) {
    return `<p data-ke-size="size16"><img src="${uploadedImage.uploadedUrl}" alt="${alt}" /></p>`;
  }

  return `<p data-ke-size="size16"><img src="${uploadedImage.uploadedUrl}" alt="${alt}" /></p>`;
};

const normalizeKageFromUrl = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('kage@')) {
    return trimmed.replace(/["'`> )\]]+$/u, '');
  }

  try {
    const parsed = new URL(trimmed);
    const path = parsed.pathname || '';
    const dnaIndex = path.indexOf('/dna/');
    if (dnaIndex >= 0) {
      const keyPath = path.slice(dnaIndex + '/dna/'.length).replace(/^\/+/, '');
      if (keyPath) {
        return `kage@${keyPath}`;
      }
    }
  } catch {
    // URL 파싱이 실패하면 기존 정규식 경로로 폴백
  }

  const directKageMatch = trimmed.match(/kage@([^|\s\]>"']+)/u);
  if (directKageMatch?.[1]) {
    return `kage@${directKageMatch[1]}`;
  }

  const dnaMatch = trimmed.match(/\/dna\/([^?#\s]+)/u);
  if (dnaMatch?.[1]) {
    return `kage@${dnaMatch[1].replace(/["'`> )\]]+$/u, '')}`;
  }

  if (/^[A-Za-z0-9_-]{10,}$/u.test(trimmed)) {
    return `kage@${trimmed}`;
  }

  const rawPathMatch = trimmed.match(/([^/?#\s]+\.[A-Za-z0-9]+)$/u);
  if (rawPathMatch?.[0] && !trimmed.includes('://') && trimmed.includes('/')) {
    return `kage@${trimmed}`;
  }

  if (!trimmed.includes('://') && !trimmed.includes(' ')) {
    if (trimmed.startsWith('kage@') || trimmed.includes('/')) {
      return `kage@${trimmed}`;
    }
  }

  return null;
};

const normalizeThumbnailForPublish = (value) => {
  const normalized = normalizeKageFromUrl(value);
  if (!normalized) {
    return normalizeImageUrlForThumbnail(value);
  }

  const body = normalized.replace(/^kage@/i, '').split(/[?#]/)[0];
  const pathPart = body?.trim();
  if (!pathPart) return null;
  const hasImageFile = /\/[^/]+\.[A-Za-z0-9]+$/u.test(pathPart);
  if (hasImageFile) {
    return `kage@${pathPart}`;
  }
  const suffix = pathPart.endsWith('/') ? 'img.jpg' : '/img.jpg';
  return `kage@${pathPart}${suffix}`;
};

const normalizeImageUrlForThumbnail = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) {
    return null;
  }
  if (trimmed.includes('data:image')) {
    return null;
  }
  if (trimmed.includes(' ') || trimmed.length < 10) {
    return null;
  }
  const imageExtensionMatch = trimmed.match(/\.(?:jpg|jpeg|png|gif|webp|bmp|avif|svg)(?:$|\?|#)/i);
  return imageExtensionMatch ? trimmed : null;
};

const extractKageFromCandidate = (value) => {
  const normalized = normalizeThumbnailForPublish(value);
  if (normalized) {
    return normalized;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  const imageTagMatch = trimmed.match(/\[##_Image\|([^|]+)\|/);
  if (imageTagMatch?.[1]) {
    return normalizeKageFromUrl(imageTagMatch[1]);
  }

  if (!trimmed.includes('://') && trimmed.includes('|')) {
    const match = trimmed.match(/kage@[^\s|]+/);
    if (match?.[0]) {
      return match[0];
    }
  }

  return null;
};

const normalizeUploadedImageThumbnail = (uploadedImage) => {
  const candidates = [
    uploadedImage?.uploadedKage,
    uploadedImage?.raw?.kage,
    uploadedImage?.raw?.uploadedKage,
    uploadedImage?.uploadedKey,
    uploadedImage?.raw?.key,
    uploadedImage?.raw?.attachmentKey,
    uploadedImage?.raw?.imageKey,
    uploadedImage?.raw?.id,
    uploadedImage?.raw?.url,
    uploadedImage?.raw?.attachmentUrl,
    uploadedImage?.raw?.thumbnail,
    uploadedImage?.url,
    uploadedImage?.uploadedUrl,
  ];

  for (const candidate of candidates) {
    const normalized = extractKageFromCandidate(candidate);
    if (normalized) {
      const final = normalizeThumbnailForPublish(normalized);
      if (final) {
        return final;
      }
    }
  }

  return null;
};

const dedupeTextValues = (values = []) => {
  const seen = new Set();
  return values
    .filter(Boolean)
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .filter((value) => {
      if (seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
};

const dedupeImageSources = (sources = []) => {
  const seen = new Set();
  return sources
    .filter(Boolean)
    .map((source) => String(source || '').trim())
    .filter(Boolean)
    .filter((source) => {
      if (seen.has(source)) {
        return false;
      }
      seen.add(source);
      return true;
    });
};

const buildFallbackImageSources = async (keyword = '') => {
  const trimmedKeyword = String(keyword || '').trim();
  if (!trimmedKeyword) {
    return [];
  }
  if (trimmedKeyword.startsWith('image-')) {
    return [];
  }
  return buildKeywordImageCandidates(trimmedKeyword);
};

const sanitizeImageQueryForProvider = (value = '') => {
  return String(value || '')
    .trim()
    .replace(/[^a-z0-9가-힣\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const buildLoremFlickrImageCandidates = (keyword = '') => {
  const safeKeyword = sanitizeImageQueryForProvider(keyword);
  if (!safeKeyword) {
    return [];
  }
  const encoded = encodeURIComponent(safeKeyword.replace(/\s+/g, ','));
  return [
    `https://loremflickr.com/1200/800/${encoded}`,
    `https://loremflickr.com/g/1200/800/${encoded}`,
  ];
};

const buildPicsumImageCandidates = (keyword = '') => {
  const safeKeyword = sanitizeImageQueryForProvider(keyword);
  const hash = safeKeyword
    ? crypto.createHash('md5').update(safeKeyword).digest('hex').slice(0, 10)
    : 'default';
  return [
    `https://picsum.photos/seed/${hash}/1200/800`,
    `https://picsum.photos/1200/800`,
  ];
};

const buildPlaceholderImageCandidates = () => {
  return [
    'https://placehold.co/1200x800.png',
    'https://via.placeholder.com/1200x800.jpg',
    'https://dummyimage.com/1200x800/000/fff.png&text=thumbnail',
  ];
};

const buildWikimediaImageCandidates = async (keyword = '') => {
  const safeKeyword = sanitizeImageQueryForProvider(keyword);
  if (!safeKeyword) {
    return [];
  }
  try {
    const query = encodeURIComponent(`${safeKeyword} file`);
    const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${query}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url&iiurlwidth=1200&format=json&origin=*`;
    imageTrace('wikimedia.request', { keyword: safeKeyword, apiUrl });
    const raw = await fetchText(apiUrl);
    const parsed = JSON.parse(raw || '{}');
    const pages = parsed?.query?.pages || {};
    const candidates = [];
    for (const page of Object.values(pages)) {
      const imageInfo = Array.isArray(page?.imageinfo) ? page.imageinfo : [];
      if (imageInfo.length === 0) {
        continue;
      }
      const first = imageInfo[0];
      if (first?.thumburl) {
        candidates.push(first.thumburl);
      } else if (first?.url) {
        candidates.push(first.url);
      }
    }
    imageTrace('wikimedia.response', { keyword: safeKeyword, count: candidates.length });
    return candidates;
  } catch {
    imageTrace('wikimedia.error', { keyword: safeKeyword });
    return [];
  }
};

const extractThumbnailFromContent = (content = '') => {
  const match = String(content).match(/\[##_Image\|([^|]+)\|/);
  if (!match?.[1]) {
    const imgMatch = String(content).match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
    if (!imgMatch?.[1]) {
      return null;
    }
    return normalizeImageUrlForThumbnail(imgMatch[1]);
  }
  return extractKageFromCandidate(match[1]);
};

const resolveMandatoryThumbnail = async ({
  rawThumbnail,
  content,
  uploadedImages = [],
  relatedImageKeywords = [],
  title = '',
}) => {
  const directThumbnail = normalizeThumbnailForPublish(rawThumbnail);
  if (directThumbnail) {
    return directThumbnail;
  }

  const uploadedThumbnail = dedupeTextValues(
    uploadedImages.flatMap((image) => [
      normalizeUploadedImageThumbnail(image),
      normalizeImageUrlForThumbnail(image?.uploadedUrl),
    ]),
  ).find(Boolean);
  if (uploadedThumbnail) {
    return normalizeThumbnailForPublish(uploadedThumbnail);
  }

  const contentThumbnail = extractThumbnailFromContent(content);
  if (contentThumbnail) {
    return normalizeThumbnailForPublish(contentThumbnail);
  }

  const normalizedKeywords = dedupeTextValues([
    ...(Array.isArray(relatedImageKeywords)
      ? relatedImageKeywords.map((item) => String(item || '').trim())
      : String(relatedImageKeywords || '')
        .split(',')
        .map((item) => item.trim())),
    String(title || '').trim(),
    '뉴스 이미지',
    '뉴스',
    'thumbnail',
  ]);

  for (const keyword of normalizedKeywords) {
    const candidates = await buildKeywordImageCandidates(keyword);
    const thumbnail = candidates
      .map((candidate) => normalizeImageUrlForThumbnail(candidate))
      .find(Boolean);
    if (thumbnail) {
      return normalizeThumbnailForPublish(thumbnail);
    }
  }

  return null;
};

const guessExtensionFromContentType = (contentType = '') => {
  const normalized = contentType.toLowerCase();
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('gif')) return 'gif';
  if (normalized.includes('bmp')) return 'bmp';
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
  return 'jpg';
};

const isImageContentType = (contentType = '') => {
  const normalized = contentType.toLowerCase();
  return normalized.startsWith('image/') || normalized.includes('application/octet-stream') || normalized.includes('binary/octet-stream');
};

const guessExtensionFromUrl = (rawUrl) => {
  try {
    const parsed = new URL(rawUrl);
    const match = parsed.pathname.match(/\.([a-zA-Z0-9]+)(?:$|\?)/);
    if (!match) return null;
    const ext = match[1].toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'heic', 'heif', 'ico'].includes(ext)) {
      return ext === 'jpeg' ? 'jpg' : ext;
    }
    return null;
  } catch {
    return null;
  }
};

const getImageSignatureExtension = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  const magic4 = buffer.slice(0, 4).toString('hex');
  const magic2 = buffer.slice(0, 2).toString('hex');
  const magic8 = buffer.slice(8, 12).toString('hex');
  if (magic2 === 'ffd8') return 'jpg';
  if (magic4 === '89504e47') return 'png';
  if (magic4 === '47494638') return 'gif';
  if (magic4 === '52494646' && magic8 === '57454250') return 'webp';
  if (magic2 === '424d') return 'bmp';
  return null;
};

const resolveLocalImagePath = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('file://')) {
    try {
      const filePath = decodeURIComponent(new URL(trimmed).pathname);
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) return filePath;
      }
    } catch {}
    return null;
  }

  const expanded = trimmed.startsWith('~')
    ? path.join(os.homedir(), trimmed.slice(1))
    : trimmed;
  const candidate = path.isAbsolute(expanded) ? expanded : path.resolve(process.cwd(), expanded);
  if (!fs.existsSync(candidate)) return null;

  try {
    const stat = fs.statSync(candidate);
    return stat.isFile() ? candidate : null;
  } catch {
    return null;
  }
};

const normalizeImageInput = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.trim();
  if (!text) {
    return null;
  }
  const localPath = resolveLocalImagePath(text);
  if (localPath) {
    return localPath;
  }

  try {
    const parsed = new URL(text);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch (error) {
    return null;
  }
};

const normalizeImageInputs = (inputs) => {
  if (typeof inputs === 'string') {
    return inputs.split(',').map((item) => normalizeImageInput(item)).filter(Boolean);
  }

  if (!Array.isArray(inputs)) {
    return [];
  }

  return inputs.map(normalizeImageInput).filter(Boolean);
};

const fetchText = async (url, retryCount = 0) => {
  if (!url) {
    throw new Error('텍스트 URL이 없습니다.');
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Accept': 'text/html,application/xhtml+xml',
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    imageTrace('fetchText', { url, retryCount });
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`텍스트 요청 실패: ${response.status} ${response.statusText}, url=${url}`);
    }

    return response.text();
  } catch (error) {
    if (retryCount < 1) {
      await sleep(700);
      return fetchText(url, retryCount + 1);
    }
    throw new Error(`웹 텍스트 다운로드 실패: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
};

const fetchTextWithHeaders = async (url, headers = {}, retryCount = 0) => {
  const merged = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    ...headers,
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: merged,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`텍스트 요청 실패: ${response.status} ${response.statusText}, url=${url}`);
    }
    return response.text();
  } catch (error) {
    if (retryCount < 1) {
      await sleep(700);
      return fetchTextWithHeaders(url, headers, retryCount + 1);
    }
    throw new Error(`웹 텍스트 다운로드 실패: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
};

const normalizeAbsoluteUrl = (value = '', base = '') => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  try {
    const url = base ? new URL(trimmed, base) : new URL(trimmed);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
};

const extractArticleUrlsFromContent = (content = '') => {
  const matches = Array.from(String(content).matchAll(/<a\s+[^>]*href=(['"])(.*?)\1/gi));
  const urls = matches
    .map((match) => match[2])
    .filter((href) => /^https?:\/\//i.test(href))
    .map((href) => href.trim())
    .filter(Boolean);
  return Array.from(new Set(urls));
};

const extractDuckDuckGoRedirectTarget = (value = '') => {
  const urlText = String(value || '').trim();
  if (!urlText) return null;

  try {
    const parsed = new URL(urlText);
    if (parsed.hostname.includes('duckduckgo.com') && parsed.pathname === '/l/') {
      const encoded = parsed.searchParams.get('uddg');
      if (encoded) {
        try {
          return decodeURIComponent(encoded);
        } catch {
          return encoded;
        }
      }
    }

    if (parsed.hostname === 'duckduckgo.com' && parsed.pathname === '/y.js') {
      const articleLike = parsed.searchParams.get('u3') || parsed.searchParams.get('url');
      if (articleLike) {
        try {
          return decodeURIComponent(articleLike);
        } catch {
          return articleLike;
        }
      }
    }
  } catch {
    return null;
  }

  return null;
};

const extractImageFromHtml = (html = '', base = '') => {
  const normalizedHtml = String(html || '');
  const metaCandidates = [
    /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]*name=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]*itemprop=["']image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<link[^>]*rel=["']image_src["'][^>]*href=["']([^"']+)["'][^>]*>/i,
  ];

  for (const pattern of metaCandidates) {
    const match = normalizedHtml.match(pattern);
    if (match?.[1]) {
      const url = normalizeAbsoluteUrl(match[1], base);
      if (url && !/favicon/i.test(url) && !/logo/i.test(url)) {
        return url;
      }
    }
  }

  const imageMatch = normalizedHtml.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
  if (imageMatch?.[1]) {
    const src = normalizeAbsoluteUrl(imageMatch[1], base);
    if (src && !/logo|favicon|avatar|pixel|spacer/i.test(src)) {
      return src;
    }
  }
  return null;
};

const resolveArticleImageByUrl = async (articleUrl) => {
  try {
    const html = await fetchText(articleUrl);
    const imageUrl = extractImageFromHtml(html, articleUrl);
    if (imageUrl) {
      return imageUrl;
    }
  } catch {
    // fallback below
  }

  try {
    const normalizedArticleUrl = String(articleUrl).trim();
    if (!normalizedArticleUrl) return null;
    const normalizedForJina = normalizedArticleUrl.startsWith('https://')
      ? normalizedArticleUrl.slice(8)
      : normalizedArticleUrl.startsWith('http://')
        ? normalizedArticleUrl.slice(7)
        : normalizedArticleUrl;
    const jinaUrl = `https://r.jina.ai/http://${normalizedForJina}`;
    const jinaHtml = await fetchText(jinaUrl);
    return extractImageFromHtml(jinaHtml, articleUrl);
  } catch {
    return null;
  }
};

const extractSearchUrlsFromText = (markdown = '') => {
  const matched = [];
  const pattern = /https?:\/\/duckduckgo\.com\/l\/\?uddg=([^)\s"']+)(?:&[^)\s"']*)?/g;
  let m = pattern.exec(markdown);
  while (m) {
    const decoded = extractDuckDuckGoRedirectTarget(`https://duckduckgo.com/l/?uddg=${m[1]}`);
    if (decoded && /^https?:\/\/.+/i.test(decoded)) {
      matched.push(decoded);
    }
    m = pattern.exec(markdown);
  }

  if (matched.length === 0) {
    const directLinks = String(markdown).match(/https?:\/\/(?:www\.)?[^\\s\)\]\[]+/g) || [];
    directLinks.forEach((link) => {
      if (link.length > 12) {
        matched.push(link);
      }
    });
  }

  return Array.from(new Set(matched));
};

const extractDuckDuckGoVqd = (html = '') => {
  const raw = String(html || '');
  const patterns = [
    /vqd='([^']+)'/i,
    /vqd="([^"]+)"/i,
    /["']vqd["']\s*:\s*["']([^"']+)["']/i,
    /vqd=([^&"'\\s>]+)/i,
  ];

  for (const pattern of patterns) {
    const matched = raw.match(pattern);
    if (matched?.[1] && matched[1].trim()) {
      return matched[1].trim();
    }
  }

  return null;
};

const fetchDuckDuckGoImageResults = async (query = '') => {
  try {
    const safeKeyword = String(query || '').trim();
    if (!safeKeyword) return [];
    const searchUrl = `https://duckduckgo.com/?ia=images&origin=funnel_home_google&t=h_&q=${encodeURIComponent(safeKeyword)}&chip-select=search&iax=images`;
    imageTrace('duckduckgo.searchPage', { query: safeKeyword, searchUrl });
    const searchText = await fetchTextWithHeaders(searchUrl, {
      Accept: 'text/html,application/xhtml+xml',
      Referer: 'https://duckduckgo.com/',
    });
    const vqd = extractDuckDuckGoVqd(searchText);
    if (!vqd) return [];

    const apiCandidates = [
      `https://duckduckgo.com/i.js?l=wt-wt&o=json&q=${encodeURIComponent(safeKeyword)}&vqd=${encodeURIComponent(vqd)}&ia=images&iax=images`,
      `https://duckduckgo.com/i.js?l=wt-wt&o=json&q=${encodeURIComponent(safeKeyword)}&ia=images&iax=images&vqd=${encodeURIComponent(vqd)}&s=0`,
      `https://duckduckgo.com/i.js?o=json&q=${encodeURIComponent(safeKeyword)}&ia=images&iax=images&vqd=${encodeURIComponent(vqd)}&p=1`,
      `https://duckduckgo.com/i.js?l=en-gb&o=json&q=${encodeURIComponent(safeKeyword)}&ia=images&iax=images&vqd=${encodeURIComponent(vqd)}`,
    ];

    const jsonHeaders = {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Referer': `https://duckduckgo.com/?q=${encodeURIComponent(safeKeyword)}&ia=images&iax=images`,
      'Origin': 'https://duckduckgo.com',
    };

    let parsed = null;
    let apiUrl = null;
    for (const candidate of apiCandidates) {
      try {
        imageTrace('duckduckgo.apiUrl', { query: safeKeyword, apiUrl: candidate });
        const apiText = await fetchTextWithHeaders(candidate, jsonHeaders);
        const safeText = String(apiText || '').trim();
        if (!safeText) {
          continue;
        }
        if (!safeText.startsWith('{') && !safeText.startsWith('[')) {
          imageTrace('duckduckgo.apiParseSkipped', { query: safeKeyword, apiUrl: candidate, reason: 'nonJsonStart' });
          continue;
        }
        parsed = JSON.parse(safeText);
        if (Array.isArray(parsed.results) && parsed.results.length > 0) {
          apiUrl = candidate;
          break;
        }
      } catch {
        imageTrace('duckduckgo.apiParseError', { query: safeKeyword, apiUrl: candidate });
      }
    }

    if (!parsed) return [];
    if (apiUrl) {
      imageTrace('duckduckgo.apiUsed', { query: safeKeyword, apiUrl });
    }

    imageTrace('duckduckgo.apiResult', {
      query: safeKeyword,
      resultCount: Array.isArray(parsed?.results) ? parsed.results.length : 0,
    });
    const results = Array.isArray(parsed.results) ? parsed.results : [];

    const images = [];
    for (const item of results) {
      if (typeof item !== 'object' || !item) continue;
      const candidates = [
        item.image,
        item.thumbnail,
        item.image_thumb,
        item.url,
        item.original,
      ];
      for (const candidate of candidates) {
        const candidateUrl = normalizeAbsoluteUrl(candidate);
        if (candidateUrl && !/favicon|logo|sprite|pixel/i.test(candidateUrl)) {
          images.push(candidateUrl);
          break;
        }
      }
    }

    return images;
  } catch {
    return [];
  }
};

const buildKeywordImageCandidates = async (keyword = '') => {
  const cleaned = String(keyword || '').trim().toLowerCase();
  const compacted = cleaned
    .replace(/[^a-z0-9가-힣\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const safeKeyword = compacted;
  if (!safeKeyword) {
    return [];
  }
  imageTrace('buildKeywordImageCandidates.start', { safeKeyword });

  const duckduckgoQueries = [
    safeKeyword,
    `${safeKeyword} 이미지`,
    `${safeKeyword} 뉴스`,
  ];
  const searchCandidates = [];
  const seen = new Set();

  const collectIfImage = (imageUrl) => {
    const resolved = normalizeAbsoluteUrl(imageUrl);
    if (resolved && !seen.has(resolved)) {
      seen.add(resolved);
      searchCandidates.push(resolved);
    }
  };

  for (const query of duckduckgoQueries) {
    if (searchCandidates.length >= 6) {
      break;
    }
    imageTrace('buildKeywordImageCandidates.ddgQuery', { query, currentCount: searchCandidates.length });
    const duckImages = await fetchDuckDuckGoImageResults(query);
    imageTrace('buildKeywordImageCandidates.ddgResult', { query, count: duckImages.length });
    for (const duckImage of duckImages.slice(0, 6)) {
      if (searchCandidates.length >= 6) break;
      collectIfImage(duckImage);
    }
  }

  const fallbackQueries = [
    safeKeyword,
    `${safeKeyword} 이미지`,
    `${safeKeyword} news`,
    '뉴스',
    '세계 뉴스',
  ];
  for (const query of fallbackQueries) {
    if (searchCandidates.length >= 6) {
      break;
    }
    imageTrace('buildKeywordImageCandidates.fallbackQuery', { query, currentCount: searchCandidates.length });
    const wikiImages = await buildWikimediaImageCandidates(query);
    imageTrace('buildKeywordImageCandidates.wikimediaResult', { query, count: wikiImages.length });
    for (const candidate of wikiImages) {
      if (searchCandidates.length >= 6) {
        break;
      }
      collectIfImage(candidate);
    }
    for (const candidate of buildLoremFlickrImageCandidates(query)) {
      imageTrace('buildKeywordImageCandidates.loremflickrCandidate', { query, candidate });
      if (searchCandidates.length >= 6) {
        break;
      }
      collectIfImage(candidate);
    }
    for (const candidate of buildPicsumImageCandidates(query)) {
      imageTrace('buildKeywordImageCandidates.picsumCandidate', { query, candidate });
      if (searchCandidates.length >= 6) {
        break;
      }
      collectIfImage(candidate);
    }
    for (const candidate of buildPlaceholderImageCandidates()) {
      imageTrace('buildKeywordImageCandidates.placeholderCandidate', { candidate });
      if (searchCandidates.length >= 6) {
        break;
      }
      collectIfImage(candidate);
    }
  }

  return searchCandidates.slice(0, 6);
};

const extractImagePlaceholders = (content = '') => {
  const matches = Array.from(String(content).matchAll(IMAGE_PLACEHOLDER_REGEX));
  return matches.map((match) => ({
    raw: match[0],
    keyword: String(match[1] || '').trim(),
  }));
};

const fetchImageBuffer = async (url, retryCount = 0) => {
  if (!url) {
    throw new Error('이미지 URL이 없습니다.');
  }

  const localPath = resolveLocalImagePath(url);
  if (localPath && !/https?:/.test(url)) {
    const buffer = await fs.promises.readFile(localPath);
    if (!buffer || buffer.length === 0) {
      throw new Error(`이미지 파일이 비어 있습니다: ${localPath}`);
    }

    const extensionFromSignature = getImageSignatureExtension(buffer);
    const extensionFromUrl = guessExtensionFromUrl(localPath);
    return {
      buffer,
      ext: extensionFromSignature || extensionFromUrl || 'jpg',
      finalUrl: localPath,
      isLocal: true,
    };
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    'Cache-Control': 'no-cache',
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers,
    });

    if (!response.ok) {
      throw new Error(`이미지 다운로드 실패: ${response.status} ${response.statusText} (${url})`);
    }

    const contentType = response.headers.get('content-type') || '';
    const normalizedContentType = contentType.toLowerCase();
    const finalUrl = response.url || url;
    const looksLikeHtml = normalizedContentType.includes('text/html') || normalizedContentType.includes('application/xhtml+xml');
    if (looksLikeHtml) {
      const html = await response.text();
      return {
        html,
        ext: 'jpg',
        finalUrl,
        isHtml: true,
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const extensionFromUrl = guessExtensionFromUrl(finalUrl);
    const extensionFromSignature = getImageSignatureExtension(buffer);
    const isImage = isImageContentType(contentType)
      || extensionFromUrl
      || extensionFromSignature;

    if (!isImage) {
      throw new Error(`이미지 콘텐츠가 아닙니다: ${contentType || '(미확인)'}, url=${finalUrl}`);
    }

    return {
      buffer,
      ext: extensionFromSignature || guessExtensionFromContentType(contentType) || extensionFromUrl || 'jpg',
      finalUrl,
    };
  } catch (error) {
    if (retryCount < 1) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      return fetchImageBuffer(url, retryCount + 1);
    }
    throw new Error(`이미지 다운로드 실패: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
};

const uploadImageFromRemote = async (api, remoteUrl, fallbackName = 'image', depth = 0) => {
  const downloaded = await fetchImageBuffer(remoteUrl);

  if (downloaded?.isHtml && downloaded?.html) {
    const extractedImageUrl = extractImageFromHtml(downloaded.html, downloaded.finalUrl || remoteUrl);
    if (!extractedImageUrl) {
      throw new Error('이미지 페이지에서 유효한 대표 이미지를 찾지 못했습니다.');
    }
    if (depth >= 1 || extractedImageUrl === remoteUrl) {
      throw new Error('이미지 페이지에서 추출된 URL이 유효하지 않아 업로드를 중단했습니다.');
    }
    return uploadImageFromRemote(api, extractedImageUrl, fallbackName, depth + 1);
  }
  const tmpDir = normalizeTempDir();
  const filename = buildImageFileName(fallbackName, downloaded.ext);
  const filePath = path.join(tmpDir, filename);

  await fs.promises.writeFile(filePath, downloaded.buffer);
  let uploaded;
  try {
    uploaded = await api.uploadImage(downloaded.buffer, filename);
  } finally {
    await fs.promises.unlink(filePath).catch(() => {});
  }
  const uploadedKage = normalizeUploadedImageThumbnail(uploaded) || (uploaded?.key ? `kage@${uploaded.key}` : null);

  if (!uploaded || !(uploaded.url || uploaded.key)) {
    throw new Error('이미지 업로드 응답이 비정상적입니다.');
  }

  return {
    sourceUrl: downloaded.finalUrl,
    uploadedUrl: uploaded.url,
    uploadedKey: uploaded.key || uploaded.url,
    uploadedKage,
    raw: uploaded,
  };
};

const replaceImagePlaceholdersWithUploaded = async (
  api,
  content,
  autoUploadImages,
  relatedImageKeywords = [],
  imageUrls = [],
  _imageCountLimit = 1,
  _minimumImageCount = 1
) => {
  const originalContent = content || '';
  if (!autoUploadImages) {
    return {
      content: originalContent,
      uploaded: [],
      uploadedCount: 0,
      status: 'skipped',
    };
  }

  let updatedContent = originalContent;
  const uploadedImages = [];
  const uploadErrors = [];
  const matches = extractImagePlaceholders(updatedContent);
  const collectedImageUrls = normalizeImageInputs(imageUrls);
  const hasPlaceholders = matches.length > 0;

  const normalizedKeywords = Array.isArray(relatedImageKeywords)
    ? relatedImageKeywords.map((item) => String(item || '').trim()).filter(Boolean)
      : typeof relatedImageKeywords === 'string'
      ? relatedImageKeywords.split(',').map((item) => item.trim()).filter(Boolean)
      : [];
  const safeImageUploadLimit = MAX_IMAGE_UPLOAD_COUNT;
  const safeMinimumImageCount = MAX_IMAGE_UPLOAD_COUNT;
  const targetImageCount = MAX_IMAGE_UPLOAD_COUNT;

  const uploadTargets = hasPlaceholders
    ? await Promise.all(matches.map(async (match, index) => {
      const keyword = match.keyword || normalizedKeywords[index] || '';
      const hasKeywordSource = Boolean(keyword);
      const primarySources = hasKeywordSource
        ? await buildKeywordImageCandidates(keyword)
        : [];
      const keywordSources = [...primarySources].filter(Boolean);
      const finalSources = keywordSources.length > 0
        ? keywordSources
        : [];
      return {
        placeholder: match,
        sources: [
          ...(collectedImageUrls[index] ? [collectedImageUrls[index]] : []),
          ...finalSources,
        ],
        keyword: keyword || `image-${index + 1}`,
      };
    }))
    : collectedImageUrls.slice(0, targetImageCount).map((imageUrl, index) => ({
      placeholder: null,
      sources: [imageUrl],
      keyword: normalizedKeywords[index] || `image-${index + 1}`,
    }));

  const missingTargets = Math.max(0, targetImageCount - uploadTargets.length);
  const fallbackBaseKeywords = normalizedKeywords.length > 0 ? normalizedKeywords : [];
  const fallbackTargets = missingTargets > 0
    ? await Promise.all(Array.from({ length: missingTargets }).map(async (_, index) => {
      const keyword = fallbackBaseKeywords[index] || fallbackBaseKeywords[fallbackBaseKeywords.length - 1];
      const sources = await buildKeywordImageCandidates(keyword);
      return {
        placeholder: null,
        sources,
        keyword: keyword || `image-${uploadTargets.length + index + 1}`,
      };
    }))
    : [];

  const finalUploadTargets = [...uploadTargets, ...fallbackTargets];
  const limitedUploadTargets = finalUploadTargets.slice(0, targetImageCount);
  const requestedImageCount = targetImageCount;
  const resolvedRequestedKeywords = dedupeTextValues(
    hasPlaceholders
      ? [
          ...matches.map((match) => match.keyword).filter(Boolean),
          ...finalUploadTargets.map((target) => target.keyword).filter(Boolean),
          ...normalizedKeywords,
        ]
      : normalizedKeywords
  );

  const requestedKeywords = resolvedRequestedKeywords.length > 0
    ? resolvedRequestedKeywords
    : normalizedKeywords;

  const hasUsableSource = limitedUploadTargets.some((target) => Array.isArray(target.sources) && target.sources.length > 0);
  if (!hasUsableSource) {
    return {
      content: originalContent,
      uploaded: [],
      uploadedCount: 0,
      status: 'need_image_urls',
      message: '자동 업로드할 이미지 후보 키워드가 없습니다. imageUrls 또는 relatedImageKeywords/플레이스홀더 키워드를 제공해 주세요.',
      requestedKeywords,
      requestedCount: requestedImageCount,
      providedImageUrls: collectedImageUrls.length,
    };
  }

  for (let i = 0; i < limitedUploadTargets.length; i += 1) {
    const target = limitedUploadTargets[i];
    const uniqueSources = dedupeImageSources(target.sources);
    let uploadedImage = null;
    let lastMessage = '';
    let success = false;

    if (uniqueSources.length === 0) {
      uploadErrors.push({
        index: i,
        sourceUrl: null,
        keyword: target.keyword,
        message: '이미지 소스가 없습니다.',
      });
      continue;
    }

    for (let sourceIndex = 0; sourceIndex < uniqueSources.length; sourceIndex += 1) {
      const sourceUrl = uniqueSources[sourceIndex];
      if (IMAGE_TRACE_ENABLED) {
        imageTrace('uploadAttempt', {
          index: i,
          sourceIndex,
          sourceUrl,
          host: (() => {
            try {
              return new URL(sourceUrl).hostname;
            } catch {
              return 'invalid-url';
            }
          })(),
        });
      }
      try {
        uploadedImage = await uploadImageFromRemote(api, sourceUrl, target.keyword);
        success = true;
        break;
      } catch (error) {
        lastMessage = error.message;
        console.log('이미지 처리 실패:', sourceUrl, error.message);
      }
    }

    if (!success) {
      const fallbackSources = dedupeImageSources([
        ...uniqueSources,
        ...(await buildFallbackImageSources(target.keyword)),
      ]);

      for (let sourceIndex = 0; sourceIndex < fallbackSources.length; sourceIndex += 1) {
        const sourceUrl = fallbackSources[sourceIndex];
        if (uniqueSources.includes(sourceUrl)) {
          continue;
        }
        if (IMAGE_TRACE_ENABLED) {
          imageTrace('uploadAttempt.fallback', {
            index: i,
            sourceIndex,
            sourceUrl,
            host: (() => {
              try {
                return new URL(sourceUrl).hostname;
              } catch {
                return 'invalid-url';
              }
            })(),
          });
        }
        try {
          uploadedImage = await uploadImageFromRemote(api, sourceUrl, target.keyword);
          success = true;
          break;
        } catch (error) {
          lastMessage = error.message;
          console.log('이미지 처리 실패(보정 소스):', sourceUrl, error.message);
        }
      }
    }

    if (!success) {
      uploadErrors.push({
        index: i,
        sourceUrl: uniqueSources[0],
        keyword: target.keyword,
        message: `이미지 업로드 실패(대체 이미지 재시도 포함): ${lastMessage}`,
      });
      continue;
    }

    const tag = buildTistoryImageTag(uploadedImage, target.keyword);
    if (target.placeholder && target.placeholder.raw) {
      const replaced = new RegExp(escapeRegExp(target.placeholder.raw), 'g');
      updatedContent = updatedContent.replace(replaced, tag);
    } else {
      updatedContent = `${tag}\n${updatedContent}`;
    }

    uploadedImages.push(uploadedImage);
  }

  if (hasPlaceholders && uploadedImages.length === 0) {
      return {
        content: originalContent,
        uploaded: [],
        uploadedCount: 0,
        status: 'image_upload_failed',
        message: '이미지 업로드에 실패했습니다. 수집한 이미지 URL을 확인해 다시 호출해 주세요.',
        errors: uploadErrors,
        requestedKeywords,
        requestedCount: requestedImageCount,
        providedImageUrls: collectedImageUrls.length,
      };
    }

  if (uploadErrors.length > 0) {
    if (uploadedImages.length < safeMinimumImageCount) {
      return {
        content: updatedContent,
        uploaded: uploadedImages,
        uploadedCount: uploadedImages.length,
        status: 'insufficient_images',
        message: `최소 이미지 업로드 장수를 충족하지 못했습니다. (요청: ${safeMinimumImageCount} / 실제: ${uploadedImages.length})`,
        errors: uploadErrors,
        requestedKeywords,
        requestedCount: requestedImageCount,
        uploadedPlaceholders: uploadedImages.length,
        providedImageUrls: collectedImageUrls.length,
        missingImageCount: Math.max(0, safeMinimumImageCount - uploadedImages.length),
        imageLimit: safeImageUploadLimit,
      };
    }

    return {
      content: updatedContent,
      uploaded: uploadedImages,
      uploadedCount: uploadedImages.length,
      status: 'image_upload_partial',
      message: '일부 이미지 업로드가 실패했습니다.',
      errors: uploadErrors,
      requestedCount: requestedImageCount,
      uploadedPlaceholders: uploadedImages.length,
      providedImageUrls: collectedImageUrls.length,
    };
  }

  if (safeMinimumImageCount > 0 && uploadedImages.length < safeMinimumImageCount) {
    return {
      content: updatedContent,
      uploaded: uploadedImages,
      uploadedCount: uploadedImages.length,
      status: 'insufficient_images',
      message: `최소 이미지 업로드 장수를 충족하지 못했습니다. (요청: ${safeMinimumImageCount} / 실제: ${uploadedImages.length})`,
      errors: uploadErrors,
      requestedKeywords,
      requestedCount: requestedImageCount,
      uploadedPlaceholders: uploadedImages.length,
      providedImageUrls: collectedImageUrls.length,
      missingImageCount: Math.max(0, safeMinimumImageCount - uploadedImages.length),
      imageLimit: safeImageUploadLimit,
    };
  }

  return {
    content: updatedContent,
    uploaded: uploadedImages,
    uploadedCount: uploadedImages.length,
    status: 'ok',
  };
};

const enrichContentWithUploadedImages = async ({
  api,
  rawContent,
  autoUploadImages,
  relatedImageKeywords = [],
  imageUrls = [],
  _imageUploadLimit = 1,
  _minimumImageCount = 1,
}) => {
  const safeImageUploadLimit = MAX_IMAGE_UPLOAD_COUNT;
  const safeMinimumImageCount = MAX_IMAGE_UPLOAD_COUNT;

  const shouldAutoUpload = autoUploadImages !== false;
  const enrichedImages = await replaceImagePlaceholdersWithUploaded(
    api,
    rawContent,
    shouldAutoUpload,
    relatedImageKeywords,
    imageUrls,
    safeImageUploadLimit,
    safeMinimumImageCount
  );

  if (enrichedImages.status === 'need_image_urls') {
    return {
      status: 'need_image_urls',
      message: enrichedImages.message,
      requestedKeywords: enrichedImages.requestedKeywords,
      requestedCount: enrichedImages.requestedCount,
      providedImageUrls: enrichedImages.providedImageUrls,
      content: enrichedImages.content,
      images: enrichedImages.uploaded || [],
      imageCount: enrichedImages.uploadedCount,
      uploadedCount: enrichedImages.uploadedCount,
      uploadErrors: enrichedImages.errors || [],
    };
  }

  if (enrichedImages.status === 'insufficient_images') {
    return {
      status: 'insufficient_images',
      message: enrichedImages.message,
      imageCount: enrichedImages.uploadedCount,
      requestedCount: enrichedImages.requestedCount,
      uploadedCount: enrichedImages.uploadedCount,
      images: enrichedImages.uploaded || [],
      content: enrichedImages.content,
      uploadErrors: enrichedImages.errors || [],
      providedImageUrls: enrichedImages.providedImageUrls,
      requestedKeywords: enrichedImages.requestedKeywords || [],
      missingImageCount: enrichedImages.missingImageCount || 0,
      imageLimit: enrichedImages.imageLimit || safeImageUploadLimit,
      minimumImageCount: safeMinimumImageCount,
    };
  }

  if (enrichedImages.status === 'image_upload_failed' || enrichedImages.status === 'image_upload_partial') {
    return {
      status: enrichedImages.status,
      message: enrichedImages.message,
      imageCount: enrichedImages.uploadedCount,
      requestedCount: enrichedImages.requestedCount,
      uploadedCount: enrichedImages.uploadedCount,
      images: enrichedImages.uploaded || [],
      content: enrichedImages.content,
      uploadErrors: enrichedImages.errors || [],
      providedImageUrls: enrichedImages.providedImageUrls,
    };
  }

  return {
    status: 'ok',
    content: enrichedImages.content,
    images: enrichedImages.uploaded || [],
    imageCount: enrichedImages.uploadedCount,
    uploadedCount: enrichedImages.uploadedCount,
  };
};

const isLoggedInByCookies = async (context) => {
  const cookies = await context.cookies('https://www.tistory.com');
  return cookies.some((cookie) => {
    const name = cookie.name.toLowerCase();
    return name.includes('tistory') || name.includes('access') || name.includes('login');
  });
};

const waitForLoginFinish = async (page, context, timeoutMs = 45000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isLoggedInByCookies(context)) {
      return true;
    }

    if (await clickKakaoAccountContinue(page)) {
      continue;
    }

    const url = page.url();
    if (!url.includes('/auth/login') && !url.includes('accounts.kakao.com/login') && !url.includes('kauth.kakao.com')) {
      return true;
    }

    await sleep(1000);
  }
  return false;
};

const withProviderSession = async (fn) => {
  const credentials = readCredentialsFromEnv();
  const hasCredentials = Boolean(credentials.username && credentials.password);

  try {
    const result = await fn();
    saveProviderMeta('tistory', {
      loggedIn: true,
      lastValidatedAt: new Date().toISOString(),
    });
    return result;
  } catch (error) {
    if (!parseSessionError(error) || !hasCredentials) {
      throw error;
    }

    try {
      const loginResult = await askForAuthentication({
        headless: false,
        manual: false,
        username: credentials.username,
        password: credentials.password,
      });

      saveProviderMeta('tistory', {
        loggedIn: loginResult.loggedIn,
        blogName: loginResult.blogName,
        blogUrl: loginResult.blogUrl,
        sessionPath: loginResult.sessionPath,
        lastRefreshedAt: new Date().toISOString(),
        lastError: null,
      });

      if (!loginResult.loggedIn) {
        throw new Error(loginResult.message || '세션 갱신 후 로그인 상태가 확인되지 않았습니다.');
      }

      return fn();
    } catch (reloginError) {
      saveProviderMeta('tistory', {
        loggedIn: false,
        lastError: buildLoginErrorMessage(reloginError),
        lastValidatedAt: new Date().toISOString(),
      });
      throw reloginError;
    }
  }
};

const persistTistorySession = async (context, targetSessionPath) => {
  const cookies = await context.cookies('https://www.tistory.com');
  const sanitized = cookies.map((cookie) => ({
    ...cookie,
    expires: Number(cookie.expires || -1),
    size: undefined,
    partitionKey: undefined,
    sourcePort: undefined,
    sourceScheme: undefined,
  }));

  const payload = {
    cookies: sanitized,
    updatedAt: new Date().toISOString(),
  };
  await fs.promises.mkdir(path.dirname(targetSessionPath), { recursive: true });
  await fs.promises.writeFile(
    targetSessionPath,
    JSON.stringify(payload, null, 2),
    'utf-8'
  );
};

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
  const scriptPath = path.join(__dirname, '..', 'scripts', 'vss-copy.ps1');
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

const createTistoryProvider = ({ sessionPath }) => {
  const tistoryApi = createTistoryApiClient({ sessionPath });

  const pending2faResult = (mode = 'kakao') => ({
    provider: 'tistory',
    status: 'pending_2fa',
    loggedIn: false,
    message: mode === 'otp'
      ? '2차 인증이 필요합니다. otp 코드를 twoFactorCode로 전달해 주세요.'
      : '카카오 2차 인증이 필요합니다. 앱에서 인증 후 다시 실행하면 됩니다.',
  });

const askForAuthentication = async ({
  headless = false,
  manual = false,
  username,
  password,
  twoFactorCode,
} = {}) => {
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });

  const resolvedUsername = username || readCredentialsFromEnv().username;
  const resolvedPassword = password || readCredentialsFromEnv().password;
  const shouldAutoFill = !manual;

  if (!manual && (!resolvedUsername || !resolvedPassword)) {
    throw new Error('티스토리 로그인 요청에 id/pw가 없습니다. id/pw를 먼저 전달하거나 TISTORY_USERNAME/TISTORY_PASSWORD를 설정해 주세요.');
  }

  const browser = await chromium.launch({
    headless: manual ? false : headless,
  });
  const context = await browser.newContext();

  const page = context.pages()[0] || (await context.newPage());

    try {
      await page.goto('https://www.tistory.com/auth/login', {
        waitUntil: 'domcontentloaded',
      });

      const loginId = resolvedUsername;
      const loginPw = resolvedPassword;

      const kakaoLoginSelector = await pickValue(page, KAKAO_TRIGGER_SELECTORS);
      if (!kakaoLoginSelector) {
        throw new Error('카카오 로그인 버튼을 찾지 못했습니다. 로그인 화면 UI가 변경되었는지 확인해 주세요.');
      }

      await page.locator(kakaoLoginSelector).click({ timeout: 5000 }).catch(() => {});
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await page.waitForTimeout(800);

      let finalLoginStatus = false;
      let pendingTwoFactorAction = false;

      if (manual) {
        console.log('');
        console.log('==============================');
        console.log('수동 로그인 모드로 전환합니다.');
        console.log('브라우저에서 직접 ID/PW/2차 인증을 완료한 뒤, 로그인 완료 상태를 기다립니다.');
        console.log('로그인 완료 또는 2차 인증은 최대 5분 내에 처리해 주세요.');
        console.log('==============================');
        finalLoginStatus = await waitForLoginFinish(page, context, 300000);
      } else if (shouldAutoFill) {
        const usernameFilled = await fillBySelector(page, KAKAO_LOGIN_SELECTORS.username, loginId);
        const passwordFilled = await fillBySelector(page, KAKAO_LOGIN_SELECTORS.password, loginPw);
        if (!usernameFilled || !passwordFilled) {
          throw new Error('카카오 로그인 폼 입력 필드를 찾지 못했습니다. 티스토리 로그인 화면 변경 시도를 확인해 주세요.');
        }

        await checkBySelector(page, KAKAO_LOGIN_SELECTORS.rememberLogin);
        const kakaoSubmitted = await clickSubmit(page, KAKAO_LOGIN_SELECTORS.submit);
        if (!kakaoSubmitted) {
          await page.keyboard.press('Enter');
        }

        finalLoginStatus = await waitForLoginFinish(page, context);

        if (!finalLoginStatus && await hasElement(page, LOGIN_OTP_SELECTORS)) {
          if (!twoFactorCode) {
            return pending2faResult('otp');
          }
          const otpFilled = await fillBySelector(page, LOGIN_OTP_SELECTORS, twoFactorCode);
          if (!otpFilled) {
            throw new Error('OTP 입력 필드를 찾지 못했습니다. 로그인 페이지를 확인해 주세요.');
          }
          await page.keyboard.press('Enter');
          finalLoginStatus = await waitForLoginFinish(page, context, 45000);
        } else if (!finalLoginStatus && (await hasElement(page, KAKAO_2FA_SELECTORS.start) || page.url().includes('tmsTwoStepVerification') || page.url().includes('emailTwoStepVerification'))) {
          await checkBySelector(page, KAKAO_2FA_SELECTORS.rememberDevice);
          const isEmailModeAvailable = await hasElement(page, KAKAO_2FA_SELECTORS.emailModeButton);
          const hasEmailCodeInput = await hasElement(page, KAKAO_2FA_SELECTORS.codeInput);

          if (hasEmailCodeInput && twoFactorCode) {
            const codeFilled = await fillBySelector(page, KAKAO_2FA_SELECTORS.codeInput, twoFactorCode);
            if (!codeFilled) {
              throw new Error('2차 인증 입력 필드를 찾지 못했습니다. 로그인 페이지를 확인해 주세요.');
            }
            const confirmed = await clickSubmit(page, KAKAO_2FA_SELECTORS.confirm);
            if (!confirmed) {
              await page.keyboard.press('Enter');
            }
            finalLoginStatus = await waitForLoginFinish(page, context, 45000);
          } else if (!twoFactorCode) {
            pendingTwoFactorAction = true;
          } else if (isEmailModeAvailable) {
            await clickSubmit(page, KAKAO_2FA_SELECTORS.emailModeButton).catch(() => {});
            await page.waitForLoadState('domcontentloaded').catch(() => {});
            await page.waitForTimeout(800);

            const codeFilled = await fillBySelector(page, KAKAO_2FA_SELECTORS.codeInput, twoFactorCode);
            if (!codeFilled) {
              throw new Error('카카오 이메일 인증 입력 필드를 찾지 못했습니다. 로그인 페이지를 확인해 주세요.');
            }

            const confirmed = await clickSubmit(page, KAKAO_2FA_SELECTORS.confirm);
            if (!confirmed) {
              await page.keyboard.press('Enter');
            }
            finalLoginStatus = await waitForLoginFinish(page, context, 45000);
          } else {
            return pending2faResult('kakao');
          }
        }
      }

      if (!finalLoginStatus) {
        if (pendingTwoFactorAction) {
          return pending2faResult('kakao');
        }
        throw new Error('로그인에 실패했습니다. 아이디/비밀번호가 정확한지 확인하고, 없으면 환경변수 TISTORY_USERNAME/TISTORY_PASSWORD를 다시 설정해 주세요.');
      }

      await context.storageState({ path: sessionPath });
      await persistTistorySession(context, sessionPath);

      tistoryApi.resetState();
      const blogName = await tistoryApi.initBlog();
      return {
        provider: 'tistory',
        loggedIn: true,
        blogName,
        blogUrl: `https://${blogName}.tistory.com`,
        sessionPath,
      };
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  };

  return {
    id: 'tistory',
    name: 'Tistory',

    async authStatus() {
      return withProviderSession(async () => {
        try {
          const blogName = await tistoryApi.initBlog();
          return {
            provider: 'tistory',
            loggedIn: true,
            blogName,
            blogUrl: `https://${blogName}.tistory.com`,
            sessionPath,
            metadata: getProviderMeta('tistory') || {},
          };
        } catch (error) {
          return {
            provider: 'tistory',
            loggedIn: false,
            sessionPath,
            error: error.message,
            metadata: getProviderMeta('tistory') || {},
          };
        }
      });
    },

    async login({
      headless = false,
      manual = false,
      username,
      password,
      twoFactorCode,
      fromChrome,
      profile,
    } = {}) {
      if (fromChrome) {
        await importSessionFromChrome(sessionPath, profile || 'Default');
        tistoryApi.resetState();
        const blogName = await tistoryApi.initBlog();
        const result = {
          provider: 'tistory',
          loggedIn: true,
          blogName,
          blogUrl: `https://${blogName}.tistory.com`,
          sessionPath,
          source: 'chrome-import',
        };
        saveProviderMeta('tistory', { loggedIn: true, blogName, blogUrl: result.blogUrl, sessionPath });
        return result;
      }

      const creds = readCredentialsFromEnv();
      const resolved = {
        headless,
        manual,
        username: username || creds.username,
        password: password || creds.password,
        twoFactorCode,
      };

      if (!resolved.manual && (!resolved.username || !resolved.password)) {
        throw new Error('티스토리 자동 로그인을 진행하려면 username/password가 필요합니다. 요청 값으로 전달하거나, 환경변수 TISTORY_USERNAME / TISTORY_PASSWORD를 설정해 주세요.');
      }

      const result = await askForAuthentication(resolved);
      saveProviderMeta('tistory', {
        loggedIn: result.loggedIn,
        blogName: result.blogName,
        blogUrl: result.blogUrl,
        sessionPath: result.sessionPath,
      });
      return result;
    },

    async publish(payload) {
      return withProviderSession(async () => {
        const title = payload.title || '제목 없음';
        const rawContent = payload.content || '';
        const visibility = mapVisibility(payload.visibility);
        const tag = normalizeTagList(payload.tags);
        const rawThumbnail = payload.thumbnail || null;
        const relatedImageKeywords = payload.relatedImageKeywords || [];
        const imageUrls = payload.imageUrls || [];
        const autoUploadImages = payload.autoUploadImages !== false;
        const safeImageUploadLimit = MAX_IMAGE_UPLOAD_COUNT;
        const safeMinimumImageCount = MAX_IMAGE_UPLOAD_COUNT;

        if (autoUploadImages) {
          await tistoryApi.initBlog();
        }

        const enrichedImages = await enrichContentWithUploadedImages({
          api: tistoryApi,
          rawContent,
          autoUploadImages,
          relatedImageKeywords,
          imageUrls,
          imageUploadLimit: safeImageUploadLimit,
          minimumImageCount: safeMinimumImageCount,
        });
        if (enrichedImages.status === 'need_image_urls') {
          return {
            mode: 'publish',
            status: 'need_image_urls',
            loggedIn: true,
            provider: 'tistory',
            title,
            visibility,
            tags: tag,
            message: enrichedImages.message,
            requestedKeywords: enrichedImages.requestedKeywords,
            requestedCount: enrichedImages.requestedCount,
            providedImageUrls: enrichedImages.providedImageUrls,
          };
        }

        if (enrichedImages.status === 'insufficient_images') {
          return {
            mode: 'publish',
            status: 'insufficient_images',
            loggedIn: true,
            provider: 'tistory',
            title,
            visibility,
            tags: tag,
            message: enrichedImages.message,
            imageCount: enrichedImages.uploadedCount,
            requestedCount: enrichedImages.requestedCount,
            uploadedCount: enrichedImages.uploadedCount,
            uploadErrors: enrichedImages.uploadErrors || [],
            providedImageUrls: enrichedImages.providedImageUrls,
            missingImageCount: enrichedImages.missingImageCount || 0,
            imageLimit: enrichedImages.imageLimit || safeImageUploadLimit,
            minimumImageCount: safeMinimumImageCount,
          };
        }

        if (enrichedImages.status === 'image_upload_failed' || enrichedImages.status === 'image_upload_partial') {
          return {
            mode: 'publish',
            status: enrichedImages.status,
            loggedIn: true,
            provider: 'tistory',
            title,
            visibility,
            tags: tag,
            thumbnail: normalizeThumbnailForPublish(payload.thumbnail) || null,
            message: enrichedImages.message,
            imageCount: enrichedImages.uploadedCount,
            requestedCount: enrichedImages.requestedCount,
            uploadedCount: enrichedImages.uploadedCount,
            uploadErrors: enrichedImages.uploadErrors || [],
            providedImageUrls: enrichedImages.providedImageUrls,
          };
        }
        const content = enrichedImages.content;
        const uploadedImages = enrichedImages?.images || enrichedImages?.uploaded || [];
        const finalThumbnail = await resolveMandatoryThumbnail({
          rawThumbnail,
          content,
          uploadedImages,
          relatedImageKeywords,
          title,
        });

        await tistoryApi.initBlog();
        const rawCategories = await tistoryApi.getCategories();
        const categories = buildCategoryList(rawCategories);

        if (!isProvidedCategory(payload.category)) {
          if (categories.length === 0) {
            return {
              provider: 'tistory',
              mode: 'publish',
              status: 'need_category',
              loggedIn: true,
              title,
              visibility,
              tags: tag,
              message: '발행을 위해 카테고리가 필요합니다. categories를 확인하고 category를 지정해 주세요.',
              categories,
            };
          }

          if (categories.length === 1) {
            payload = { ...payload, category: categories[0].id };
          } else {
            if (!process.stdin || !process.stdin.isTTY) {
              const sampleCategory = categories.slice(0, 5).map((item) => `${item.id}: ${item.name}`).join(', ');
              const sampleText = sampleCategory.length > 0 ? ` 예: ${sampleCategory}` : '';
              return {
                provider: 'tistory',
                mode: 'publish',
                status: 'need_category',
                loggedIn: true,
                title,
                visibility,
                tags: tag,
                message: `카테고리가 지정되지 않았습니다. 비대화형 환경에서는 --category 옵션이 필수입니다. 사용법: --category <카테고리ID>.${sampleText}`,
                categories,
              };
            }

            const selectedCategoryId = await promptCategorySelection(categories);
            if (!selectedCategoryId) {
              return {
                provider: 'tistory',
                mode: 'publish',
                status: 'need_category',
                loggedIn: true,
                title,
                visibility,
                tags: tag,
                message: '카테고리가 지정되지 않았습니다. 카테고리를 입력해 발행을 진행해 주세요.',
                categories,
              };
            }

            payload = { ...payload, category: selectedCategoryId };
          }
        }

        const category = Number(payload.category);
        if (!Number.isInteger(category) || Number.isNaN(category)) {
          return {
            provider: 'tistory',
            mode: 'publish',
            status: 'invalid_category',
            loggedIn: true,
            title,
            visibility,
            tags: tag,
            message: '유효한 category를 숫자로 지정해 주세요.',
            categories,
          };
        }

        const validCategoryIds = categories.map((item) => item.id);
        if (!validCategoryIds.includes(category) && categories.length > 0) {
          return {
            provider: 'tistory',
            mode: 'publish',
            status: 'invalid_category',
            loggedIn: true,
            title,
            visibility,
            tags: tag,
            message: '존재하지 않는 category입니다. categories를 확인해 주세요.',
            categories,
          };
        }

        try {
          const result = await tistoryApi.publishPost({
            title,
            content,
            visibility,
            category,
            tag,
            thumbnail: finalThumbnail,
          });

          return {
            provider: 'tistory',
            mode: 'publish',
            title,
            category,
            visibility,
            tags: tag,
            thumbnail: finalThumbnail,
            images: enrichedImages.images,
            imageCount: enrichedImages.uploadedCount,
            minimumImageCount: safeMinimumImageCount,
            url: result.entryUrl || null,
            raw: result,
          };
        } catch (error) {
          if (!isPublishLimitError(error)) {
            throw error;
          }

          try {
            const fallbackPublishResult = await tistoryApi.publishPost({
              title,
              content,
              visibility: 0,
              category,
              tag,
              thumbnail: finalThumbnail,
            });

            return {
              provider: 'tistory',
              mode: 'publish',
              status: 'publish_fallback_to_private',
              title,
              category,
              visibility: 0,
              tags: tag,
              thumbnail: finalThumbnail,
              images: enrichedImages.images,
              imageCount: enrichedImages.uploadedCount,
              minimumImageCount: safeMinimumImageCount,
              url: fallbackPublishResult.entryUrl || null,
              raw: fallbackPublishResult,
              message: '발행 제한(403)으로 인해 비공개로 발행했습니다.',
              fallbackThumbnail: finalThumbnail,
            };
          } catch (fallbackError) {
            if (!isPublishLimitError(fallbackError)) {
              throw fallbackError;
            }

            return {
              provider: 'tistory',
              mode: 'publish',
              status: 'publish_fallback_to_private_failed',
              title,
              category,
              visibility: 0,
              tags: tag,
              thumbnail: finalThumbnail,
              images: enrichedImages.images,
              imageCount: enrichedImages.uploadedCount,
              minimumImageCount: safeMinimumImageCount,
              message: '발행 제한(403)으로 인해 공개/비공개 모두 실패했습니다.',
              raw: {
                success: false,
                error: fallbackError.message,
              },
            };
          }
        }
      });
    },

    async saveDraft(payload) {
      return withProviderSession(async () => {
        const title = payload.title || '임시저장';
        const rawContent = payload.content || '';
        const rawThumbnail = payload.thumbnail || null;
        const tag = normalizeTagList(payload.tags);
        const relatedImageKeywords = payload.relatedImageKeywords || [];
        const imageUrls = payload.imageUrls || [];
        const autoUploadImages = payload.autoUploadImages !== false;
        const safeImageUploadCount = MAX_IMAGE_UPLOAD_COUNT;
        const safeMinimumImageCount = MAX_IMAGE_UPLOAD_COUNT;

        if (autoUploadImages) {
          await tistoryApi.initBlog();
        }

        const enrichedImages = await enrichContentWithUploadedImages({
          api: tistoryApi,
          rawContent,
          autoUploadImages,
          relatedImageKeywords,
          imageUrls,
          imageUploadLimit: safeImageUploadCount,
          minimumImageCount: safeMinimumImageCount,
        });
        if (enrichedImages.status === 'need_image_urls') {
          return {
            mode: 'draft',
            status: 'need_image_urls',
            loggedIn: true,
            provider: 'tistory',
            title,
            message: enrichedImages.message,
            requestedKeywords: enrichedImages.requestedKeywords,
            requestedCount: enrichedImages.requestedCount,
            providedImageUrls: enrichedImages.providedImageUrls,
            imageCount: enrichedImages.imageCount,
            minimumImageCount: safeMinimumImageCount,
            images: enrichedImages.uploaded || [],
            uploadedCount: enrichedImages.uploadedCount,
          };
        }

        if (enrichedImages.status === 'insufficient_images') {
          return {
            mode: 'draft',
            status: 'insufficient_images',
            loggedIn: true,
            provider: 'tistory',
            title,
            message: enrichedImages.message,
            imageCount: enrichedImages.imageCount,
            requestedCount: enrichedImages.requestedCount,
            uploadedCount: enrichedImages.uploadedCount,
            uploadErrors: enrichedImages.uploadErrors,
            providedImageUrls: enrichedImages.providedImageUrls,
            minimumImageCount: safeMinimumImageCount,
            imageLimit: enrichedImages.imageLimit || safeImageUploadCount,
            images: enrichedImages.uploaded || [],
          };
        }

        if (enrichedImages.status === 'image_upload_failed' || enrichedImages.status === 'image_upload_partial') {
          return {
            mode: 'draft',
            status: enrichedImages.status,
            loggedIn: true,
            provider: 'tistory',
            title,
            message: enrichedImages.message,
            imageCount: enrichedImages.imageCount,
            requestedCount: enrichedImages.requestedCount,
            uploadedCount: enrichedImages.uploadedCount,
            uploadErrors: enrichedImages.uploadErrors || [],
            providedImageUrls: enrichedImages.providedImageUrls,
            images: enrichedImages.uploaded || [],
          };
        }

        const content = enrichedImages.content;
        const thumbnail = await resolveMandatoryThumbnail({
          rawThumbnail,
          content,
          uploadedImages: enrichedImages?.uploaded || [],
          relatedImageKeywords,
          title,
        });

        await tistoryApi.initBlog();
        const result = await tistoryApi.saveDraft({ title, content });
        return {
          provider: 'tistory',
          mode: 'draft',
          title,
          status: 'ok',
          category: Number(payload.category) || 0,
          tags: tag,
          sequence: result.draft?.sequence || null,
          thumbnail,
          minimumImageCount: safeMinimumImageCount,
          imageCount: enrichedImages.imageCount,
          images: enrichedImages.uploaded || [],
          uploadErrors: enrichedImages.uploadErrors || null,
          draftContent: content,
          raw: result,
        };
      });
    },

    async listCategories() {
      return withProviderSession(async () => {
        await tistoryApi.initBlog();
        const categories = await tistoryApi.getCategories();
        return {
          provider: 'tistory',
          categories: Object.entries(categories).map(([name, id]) => ({
            name,
            id: Number(id),
          })),
        };
      });
    },

    async listPosts({ limit = 20 } = {}) {
      return withProviderSession(async () => {
        await tistoryApi.initBlog();
        const result = await tistoryApi.getPosts();
        const items = Array.isArray(result?.items) ? result.items : [];
        return {
          provider: 'tistory',
          totalCount: result.totalCount || items.length,
          posts: items.slice(0, Math.max(1, Number(limit) || 20)),
        };
      });
    },

    async getPost({ postId, includeDraft = false } = {}) {
      return withProviderSession(async () => {
        const resolvedPostId = String(postId || '').trim();
        if (!resolvedPostId) {
          return {
            provider: 'tistory',
            mode: 'post',
            status: 'invalid_post_id',
            message: 'postId가 필요합니다.',
          };
        }

        await tistoryApi.initBlog();
        const post = await tistoryApi.getPost({
          postId: resolvedPostId,
          includeDraft: Boolean(includeDraft),
        });
        if (!post) {
          return {
            provider: 'tistory',
            mode: 'post',
            status: 'not_found',
            postId: resolvedPostId,
            includeDraft: Boolean(includeDraft),
            message: '해당 postId의 글을 찾을 수 없습니다.',
          };
        }
        return {
          provider: 'tistory',
          mode: 'post',
          postId: resolvedPostId,
          post,
          includeDraft: Boolean(includeDraft),
        };
      });
    },

    async logout() {
      clearProviderMeta('tistory');
      return {
        provider: 'tistory',
        loggedOut: true,
        sessionPath,
      };
    },
  };
};

module.exports = createTistoryProvider;
