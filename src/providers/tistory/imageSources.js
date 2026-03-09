const crypto = require('crypto');
const { imageTrace } = require('./utils');
const { fetchText, fetchTextWithHeaders, normalizeAbsoluteUrl, extractDuckDuckGoVqd } = require('./fetchLayer');

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

module.exports = {
  sanitizeImageQueryForProvider,
  buildLoremFlickrImageCandidates,
  buildPicsumImageCandidates,
  buildPlaceholderImageCandidates,
  buildWikimediaImageCandidates,
  fetchDuckDuckGoImageResults,
  buildKeywordImageCandidates,
  buildFallbackImageSources,
};
