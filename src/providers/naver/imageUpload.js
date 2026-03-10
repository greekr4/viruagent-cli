const fs = require('fs');
const path = require('path');
const { createImageComponent } = require('./editorConvert');
const { buildKeywordImageCandidates } = require('../tistory/imageSources');

/**
 * 이미지 URL 또는 로컬 경로에서 이미지 버퍼를 가져온다.
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
      throw new Error(`이미지 다운로드 실패: ${response.status} — ${source}`);
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
 * 이미지 소스들을 네이버에 업로드하고 에디터 컴포넌트 배열로 반환한다.
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
 * relatedImageKeywords에서 이미지를 검색하고, imageUrls와 합쳐서 업로드한다.
 * 티스토리 imageSources.js의 buildKeywordImageCandidates를 재사용한다.
 */
const collectAndUploadImages = async (naverApi, {
  imageUrls = [],
  relatedImageKeywords = [],
  token,
  imageUploadLimit = 2,
}) => {
  const collectedUrls = [...imageUrls];

  // 키워드에서 이미지 URL 검색
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
      // 검색 실패 시 무시
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
