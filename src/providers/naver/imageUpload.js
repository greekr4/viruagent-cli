const fs = require('fs');
const path = require('path');
const { createImageComponent } = require('./editorConvert');
const { buildKeywordImageCandidates } = require('../tistory/imageSources');

/**
 * Fetches an image buffer from a URL or local file path.
 */
const fetchImageBuffer = async (source) => {
  if (fs.existsSync(source)) {
    return {
      buffer: fs.readFileSync(source),
      filename: path.basename(source),
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(source, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    });
    if (!response.ok) {
      throw new Error(`Image download failed: ${response.status} — ${source}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const urlPath = new URL(response.url || source).pathname;
    const filename = path.basename(urlPath) || 'image.jpg';
    return {
      buffer: Buffer.from(arrayBuffer),
      filename,
    };
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Uploads image sources to Naver and returns an array of editor components.
 */
const uploadAndCreateImageComponents = async (naverApi, imageSources, token) => {
  const components = [];
  const errors = [];

  for (let i = 0; i < imageSources.length; i++) {
    const source = imageSources[i];
    try {
      const { buffer, filename } = await fetchImageBuffer(source);
      const imgData = await naverApi.uploadImage(buffer, filename, token);
      if (imgData) {
        imgData.represent = i === 0 ? 'true' : 'false';
        components.push(createImageComponent(imgData));
      }
    } catch (error) {
      errors.push({ source, error: error.message });
    }
  }

  return { components, errors };
};

/**
 * Searches for images from relatedImageKeywords, merges with imageUrls, and uploads them.
 * Reuses buildKeywordImageCandidates from Tistory's imageSources.js.
 */
const collectAndUploadImages = async (naverApi, {
  imageUrls = [],
  relatedImageKeywords = [],
  token,
  imageUploadLimit = 2,
}) => {
  const collectedUrls = [...imageUrls];

  // Search image URLs from keywords
  const normalizedKeywords = Array.isArray(relatedImageKeywords)
    ? relatedImageKeywords.map((k) => String(k || '').trim()).filter(Boolean)
    : String(relatedImageKeywords || '').split(',').map((k) => k.trim()).filter(Boolean);

  for (const keyword of normalizedKeywords) {
    if (collectedUrls.length >= imageUploadLimit) break;
    try {
      const candidates = await buildKeywordImageCandidates(keyword);
      for (const candidate of candidates) {
        if (collectedUrls.length >= imageUploadLimit) break;
        if (!collectedUrls.includes(candidate)) {
          collectedUrls.push(candidate);
        }
      }
    } catch {
      // Ignore search failures
    }
  }

  const limitedUrls = collectedUrls.slice(0, imageUploadLimit);
  if (limitedUrls.length === 0) {
    return { components: [], errors: [] };
  }

  return uploadAndCreateImageComponents(naverApi, limitedUrls, token);
};

module.exports = {
  fetchImageBuffer,
  uploadAndCreateImageComponents,
  collectAndUploadImages,
};
