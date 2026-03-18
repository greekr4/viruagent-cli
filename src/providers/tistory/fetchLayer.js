const { sleep, imageTrace } = require('./utils');

const fetchText = async (url, retryCount = 0) => {
  if (!url) {
    throw new Error('Text URL is missing.');
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
      throw new Error(`Text request failed: ${response.status} ${response.statusText}, url=${url}`);
    }

    return response.text();
  } catch (error) {
    if (retryCount < 1) {
      await sleep(700);
      return fetchText(url, retryCount + 1);
    }
    throw new Error(`Web text download failed: ${error.message}`);
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
      throw new Error(`Text request failed: ${response.status} ${response.statusText}, url=${url}`);
    }
    return response.text();
  } catch (error) {
    if (retryCount < 1) {
      await sleep(700);
      return fetchTextWithHeaders(url, headers, retryCount + 1);
    }
    throw new Error(`Web text download failed: ${error.message}`);
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

module.exports = {
  fetchText,
  fetchTextWithHeaders,
  normalizeAbsoluteUrl,
  extractArticleUrlsFromContent,
  extractDuckDuckGoRedirectTarget,
  extractImageFromHtml,
  resolveArticleImageByUrl,
  extractSearchUrlsFromText,
  extractDuckDuckGoVqd,
};
