const fs = require('fs');
const os = require('os');
const path = require('path');

const normalizeKageFromUrl = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('kage@')) {
    return trimmed.replace(/["'`> )\]]+$/u, '');
  }

  try {
    const parsed = new URL(trimmed);
    const urlPath = parsed.pathname || '';
    const dnaIndex = urlPath.indexOf('/dna/');
    if (dnaIndex >= 0) {
      const keyPath = urlPath.slice(dnaIndex + '/dna/'.length).replace(/^\/+/, '');
      if (keyPath) {
        return `kage@${keyPath}`;
      }
    }
  } catch {
    // If URL parsing fails, fall back to regex-based path extraction
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

module.exports = {
  normalizeKageFromUrl,
  normalizeImageUrlForThumbnail,
  normalizeThumbnailForPublish,
  extractKageFromCandidate,
  normalizeUploadedImageThumbnail,
  buildTistoryImageTag,
  guessExtensionFromContentType,
  isImageContentType,
  guessExtensionFromUrl,
  getImageSignatureExtension,
  resolveLocalImagePath,
  normalizeImageInput,
  normalizeImageInputs,
  extractThumbnailFromContent,
};
