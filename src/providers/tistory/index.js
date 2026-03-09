const { saveProviderMeta, clearProviderMeta, getProviderMeta } = require('../../storage/sessionStore');
const createTistoryApiClient = require('../../services/tistoryApiClient');
const {
  readCredentialsFromEnv,
  mapVisibility,
  normalizeTagList,
  isPublishLimitError,
  isProvidedCategory,
  buildCategoryList,
  promptCategorySelection,
  MAX_IMAGE_UPLOAD_COUNT,
} = require('./utils');
const { normalizeThumbnailForPublish } = require('./imageNormalization');
const { enrichContentWithUploadedImages, resolveMandatoryThumbnail } = require('./imageEnrichment');
const { createWithProviderSession } = require('./session');
const { importSessionFromChrome } = require('./chromeImport');
const { createAskForAuthentication } = require('./auth');

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

  const askForAuthentication = createAskForAuthentication({
    sessionPath,
    tistoryApi,
    pending2faResult,
  });

  const withProviderSession = createWithProviderSession(askForAuthentication);

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
