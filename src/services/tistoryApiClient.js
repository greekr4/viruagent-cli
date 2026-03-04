const fs = require('fs');
const path = require('path');
const vm = require('vm');

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
const API_HOST = 'https://www.tistory.com';

const getTimeout = () => 20000;

const normalizeCookies = (session) => {
  if (!session) {
    return [];
  }

  const rawCookies = Array.isArray(session)
    ? session
    : Array.isArray(session.cookies)
      ? session.cookies
      : [];

  return rawCookies
    .filter((cookie) => cookie && typeof cookie === 'object')
    .filter((cookie) => cookie.name && cookie.value !== undefined && cookie.value !== null)
    .filter((cookie) => {
      if (!cookie.domain) return true;
      return String(cookie.domain).includes('tistory') || String(cookie.domain).includes('tistory.com');
    })
    .map((cookie) => `${cookie.name}=${cookie.value}`);
};

const readSessionCookies = (sessionPath) => {
  const resolvedPath = path.resolve(sessionPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`세션 파일이 없습니다. ${resolvedPath}에 로그인 정보를 먼저 저장하세요.`);
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
  } catch (error) {
    throw new Error(`세션 파일 파싱 실패: ${error.message}`);
  }

  const cookies = normalizeCookies(raw);
  if (!cookies.length) {
    throw new Error('세션에 유효한 쿠키가 없습니다. 다시 로그인해 주세요.');
  }

  return cookies.join('; ');
};

const buildReferer = (base) => `${base}/newpost`;

const createFetchController = () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeout());
  return { controller, timeout };
};

const createTistoryApiClient = ({ sessionPath }) => {
  let blogName = null;
  let blogInfo = null;

  const resetState = () => {
    blogName = null;
    blogInfo = null;
  };

  const getSessionCookies = () => readSessionCookies(sessionPath);

  const getBase = () => {
    if (!blogName) {
      throw new Error('블로그 이름이 초기화되지 않았습니다. initBlog()를 먼저 호출하세요.');
    }
    return `https://${blogName}.tistory.com/manage`;
  };

  const getHeaders = (baseOverride) => {
    const base = baseOverride || getBase();
    return {
      Cookie: getSessionCookies(),
      'Content-Type': 'application/json;charset=UTF-8',
      'User-Agent': USER_AGENT,
      Referer: buildReferer(base),
      'X-Requested-With': 'XMLHttpRequest',
    };
  };

  const normalizeTagPayload = (value = '') => {
    const values = Array.isArray(value)
      ? value
      : String(value || '').replace(/\r?\n/g, ',').split(',');

    return values
      .map((tag) => String(tag || '').trim())
      .filter(Boolean)
      .map((tag) => tag.replace(/["']/g, '').trim())
      .filter(Boolean)
      .slice(0, 10)
      .join(',');
  };

  const normalizeThumbnail = (value = '') => {
    const normalized = String(value || '').trim().replace(/^kage@/i, '').split(/[?#]/)[0].trim();
    if (!normalized) return null;
    if (/^https?:\/\//i.test(normalized)) {
      return normalized;
    }

    if (/\/[^/]+\.[A-Za-z0-9]+$/u.test(normalized)) {
      return `kage@${normalized}`;
    }

    const suffix = normalized.endsWith('/') ? 'img.jpg' : '/img.jpg';
    return `kage@${normalized}${suffix}`;
  };

  const requestJson = async (url, options = {}) => {
    const { controller, timeout } = createFetchController();
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        ...options,
      });
      if (!response.ok) {
        let detail = '';
        try {
          detail = await response.text();
          detail = detail ? `: ${detail.slice(0, 200)}` : '';
        } catch {
          detail = '';
        }
        throw new Error(`요청 실패: ${response.status} ${response.statusText}${detail}`);
      }
      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  };

  const requestText = async (url, options = {}) => {
    const { controller, timeout } = createFetchController();
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        ...options,
      });
      if (!response.ok) {
        throw new Error(`요청 실패: ${response.status} ${response.statusText}`);
      }
      return response.text();
    } finally {
      clearTimeout(timeout);
    }
  };

  const flattenCategories = (tree = [], collector = {}) => {
    for (const item of tree) {
      if (!item || typeof item !== 'object') continue;
      collector[item.label] = Number(item.id);
      if (Array.isArray(item.children) && item.children.length > 0) {
        flattenCategories(item.children, collector);
      }
    }
    return collector;
  };

  const initBlog = async () => {
    if (blogName) return blogName;

    const headers = {
      Cookie: getSessionCookies(),
      'User-Agent': USER_AGENT,
      Referer: `${API_HOST}/manage`,
    };

    const response = await fetch(`${API_HOST}/legacy/member/blog/api/myBlogs`, {
      headers,
      redirect: 'follow',
    });
    if (!response.ok) {
      throw new Error(`블로그 정보 조회 실패: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error('세션이 만료되었습니다. /auth/login으로 다시 로그인하세요.');
    }

    const json = await response.json();
    const defaultBlog = (json?.data || []).find((blog) => blog?.defaultBlog) || (json?.data || [])[0];
    if (!defaultBlog) {
      throw new Error('블로그를 찾을 수 없습니다.');
    }

    blogName = defaultBlog.name;
    blogInfo = defaultBlog;
    return blogName;
  };

  const publishPost = async ({ title, content, visibility = 20, category = 0, tag = '', thumbnail = null }) => {
    const base = getBase();
    const normalizedTag = normalizeTagPayload(tag);
    const normalizedThumbnail = normalizeThumbnail(thumbnail);
    const body = {
      id: '0',
      title,
      content,
      visibility,
      category,
      tag: normalizedTag,
      published: 1,
      type: 'post',
      uselessMarginForEntry: 1,
      cclCommercial: 0,
      cclDerive: 0,
      attachments: [],
      recaptchaValue: '',
      draftSequence: null,
      ...(normalizedThumbnail ? { thumbnail: normalizedThumbnail } : {}),
    };

    return requestJson(`${base}/post.json`, {
      method: 'POST',
      headers: getHeaders(base),
      body: JSON.stringify(body),
    });
  };

  const saveDraft = async ({ title, content }) => {
    const base = getBase();
    return requestJson(`${base}/drafts`, {
      method: 'POST',
      headers: getHeaders(base),
      body: JSON.stringify({ title, content }),
    });
  };

  const getPosts = async () => {
    const base = getBase();
    return requestJson(`${base}/posts.json`, {
      method: 'GET',
      headers: getHeaders(base),
    });
  };

  const getCategories = async () => {
    const base = getBase();
    const html = await requestText(`${base}/newpost`, {
      method: 'GET',
      headers: getHeaders(base),
    });

    const match = html.match(/window\.Config\s*=\s*(\{[\s\S]*?\})\s*(?:\n|;)/);
    if (!match) {
      throw new Error('카테고리 파싱 실패');
    }

    const sandbox = {};
    vm.runInNewContext(`var result = ${match[1]};`, sandbox);
    const rootCategories = sandbox?.result?.blog?.categories;
    if (!Array.isArray(rootCategories)) {
      throw new Error('카테고리 파싱 실패');
    }

    return flattenCategories(rootCategories, {});
  };

  const uploadImage = async (imageBuffer, filename = 'image.jpg') => {
    const base = getBase();
    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
    formData.append('file', blob, filename);

    const response = await fetch(`${base}/post/attach.json`, {
      method: 'POST',
      headers: {
        Cookie: getSessionCookies(),
        'User-Agent': USER_AGENT,
        Referer: buildReferer(base),
        Accept: 'application/json, text/plain, */*',
      },
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`이미지 업로드 실패: ${response.status} ${text ? `: ${text.slice(0, 500)}` : ''}`);
    }

    const uploaded = await response.json();
    if (!uploaded?.url) {
      throw new Error('이미지 업로드 응답에 URL이 없습니다.');
    }
    return uploaded;
  };

  const getPost = async ({ postId, includeDraft = false } = {}) => {
    const normalizedPostId = String(postId || '').trim();
    if (!normalizedPostId) {
      return null;
    }

    const result = await getPosts();
    const candidates = [];
    if (Array.isArray(result?.items)) {
      candidates.push(...result.items);
    }
    if (includeDraft && Array.isArray(result?.drafts)) {
      candidates.push(...result.drafts);
    }

    return candidates.find((item) => String(item.id) === normalizedPostId) || null;
  };

  return {
    initBlog,
    publishPost,
    saveDraft,
    getPosts,
    getCategories,
    uploadImage,
    getPost,
    resetState,
  };
};

module.exports = createTistoryApiClient;
