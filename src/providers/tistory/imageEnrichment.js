const fs = require('fs');
const path = require('path');
const {
  IMAGE_TRACE_ENABLED,
  imageTrace,
  MAX_IMAGE_UPLOAD_COUNT,
  IMAGE_PLACEHOLDER_REGEX,
  escapeRegExp,
  normalizeTempDir,
  buildImageFileName,
  dedupeTextValues,
  dedupeImageSources,
} = require('./utils');
const {
  normalizeUploadedImageThumbnail,
  normalizeImageUrlForThumbnail,
  normalizeThumbnailForPublish,
  buildTistoryImageTag,
  normalizeImageInputs,
  guessExtensionFromContentType,
  isImageContentType,
  guessExtensionFromUrl,
  getImageSignatureExtension,
  resolveLocalImagePath,
  extractThumbnailFromContent,
} = require('./imageNormalization');
const { extractImageFromHtml } = require('./fetchLayer');
const { buildKeywordImageCandidates, buildFallbackImageSources } = require('./imageSources');

const extractImagePlaceholders = (content = '') => {
  const matches = Array.from(String(content).matchAll(IMAGE_PLACEHOLDER_REGEX));
  return matches.map((match) => ({
    raw: match[0],
    keyword: String(match[1] || '').trim(),
  }));
};

const fetchImageBuffer = async (url, retryCount = 0) => {
  if (!url) {
    throw new Error('Image URL is missing.');
  }

  const localPath = resolveLocalImagePath(url);
  if (localPath && !/https?:/.test(url)) {
    const buffer = await fs.promises.readFile(localPath);
    if (!buffer || buffer.length === 0) {
      throw new Error(`Image file is empty: ${localPath}`);
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
      throw new Error(`Image download failed: ${response.status} ${response.statusText} (${url})`);
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
      throw new Error(`Not an image content type: ${contentType || '(unknown)'}, url=${finalUrl}`);
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
    throw new Error(`Image download failed: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
};

const uploadImageFromRemote = async (api, remoteUrl, fallbackName = 'image', depth = 0) => {
  const downloaded = await fetchImageBuffer(remoteUrl);

  if (downloaded?.isHtml && downloaded?.html) {
    const extractedImageUrl = extractImageFromHtml(downloaded.html, downloaded.finalUrl || remoteUrl);
    if (!extractedImageUrl) {
      throw new Error('Could not find a valid representative image from the image page.');
    }
    if (depth >= 1 || extractedImageUrl === remoteUrl) {
      throw new Error('The extracted URL from the image page is invalid. Upload aborted.');
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
    throw new Error('Image upload response is invalid.');
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
      message: 'No image candidate keywords available for auto-upload. Please provide imageUrls or relatedImageKeywords/placeholder keywords.',
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
        message: 'No image source available.',
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
        console.log('Image processing failed:', sourceUrl, error.message);
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
          console.log('Image processing failed (fallback source):', sourceUrl, error.message);
        }
      }
    }

    if (!success) {
      uploadErrors.push({
        index: i,
        sourceUrl: uniqueSources[0],
        keyword: target.keyword,
        message: `Image upload failed (including fallback retries): ${lastMessage}`,
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
        message: 'Image upload failed. Please verify the collected image URLs and try again.',
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
        message: `Minimum image upload count not met. (required: ${safeMinimumImageCount} / actual: ${uploadedImages.length})`,
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
      message: 'Some image uploads failed.',
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
      message: `Minimum image upload count not met. (required: ${safeMinimumImageCount} / actual: ${uploadedImages.length})`,
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
    'news image',
    'news',
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

module.exports = {
  extractImagePlaceholders,
  fetchImageBuffer,
  uploadImageFromRemote,
  replaceImagePlaceholdersWithUploaded,
  enrichContentWithUploadedImages,
  resolveMandatoryThumbnail,
};
