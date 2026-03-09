const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

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

const MAX_IMAGE_UPLOAD_COUNT = 1;

const IMAGE_PLACEHOLDER_REGEX = /<!--\s*IMAGE:\s*([^>]*?)\s*-->/g;

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

module.exports = {
  IMAGE_TRACE_ENABLED,
  imageTrace,
  MAX_IMAGE_UPLOAD_COUNT,
  IMAGE_PLACEHOLDER_REGEX,
  readCredentialsFromEnv,
  mapVisibility,
  normalizeTagList,
  parseSessionError,
  buildLoginErrorMessage,
  promptCategorySelection,
  isPublishLimitError,
  isProvidedCategory,
  buildCategoryList,
  sleep,
  escapeRegExp,
  sanitizeKeywordForFilename,
  normalizeTempDir,
  buildImageFileName,
  dedupeTextValues,
  dedupeImageSources,
};
