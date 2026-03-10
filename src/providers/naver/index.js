const { saveProviderMeta, clearProviderMeta, getProviderMeta } = require('../../storage/sessionStore');
const createNaverApiClient = require('../../services/naverApiClient');
const {
  readNaverCredentials,
  normalizeNaverTagList,
  mapNaverVisibility,
} = require('./utils');
const { convertHtmlToEditorComponents } = require('./editorConvert');
const { collectAndUploadImages } = require('./imageUpload');
const { createNaverWithProviderSession } = require('./session');
const { importSessionFromChrome } = require('./chromeImport');
const { createAskForAuthentication } = require('./auth');

const createNaverProvider = ({ sessionPath }) => {
  const naverApi = createNaverApiClient({ sessionPath });

  const askForAuthentication = createAskForAuthentication({
    sessionPath,
    naverApi,
  });

  const withProviderSession = createNaverWithProviderSession(askForAuthentication);

  return {
    id: 'naver',
    name: 'Naver',

    async authStatus() {
      return withProviderSession(async () => {
        try {
          const blogId = await naverApi.initBlog();
          return {
            provider: 'naver',
            loggedIn: true,
            blogId,
            blogUrl: `https://blog.naver.com/${blogId}`,
            sessionPath,
            metadata: getProviderMeta('naver') || {},
          };
        } catch (error) {
          return {
            provider: 'naver',
            loggedIn: false,
            sessionPath,
            error: error.message,
            metadata: getProviderMeta('naver') || {},
          };
        }
      });
    },

    async login({
      headless = false,
      manual = false,
      username,
      password,
      fromChrome,
      profile,
    } = {}) {
      if (fromChrome) {
        await importSessionFromChrome(sessionPath, profile || 'Default');
        naverApi.resetState();
        const blogId = await naverApi.initBlog();
        const result = {
          provider: 'naver',
          loggedIn: true,
          blogId,
          blogUrl: `https://blog.naver.com/${blogId}`,
          sessionPath,
          source: 'chrome-import',
        };
        saveProviderMeta('naver', { loggedIn: true, blogId, blogUrl: result.blogUrl, sessionPath });
        return result;
      }

      const creds = readNaverCredentials();
      const resolved = {
        headless,
        manual,
        username: username || creds.username,
        password: password || creds.password,
      };

      if (!resolved.manual && (!resolved.username || !resolved.password)) {
        throw new Error('네이버 자동 로그인을 진행하려면 username/password가 필요합니다. 환경변수 NAVER_USERNAME / NAVER_PASSWORD를 설정하거나 --manual 모드를 사용해 주세요.');
      }

      const result = await askForAuthentication(resolved);
      saveProviderMeta('naver', {
        loggedIn: result.loggedIn,
        blogId: result.blogId,
        blogUrl: result.blogUrl,
        sessionPath: result.sessionPath,
      });
      return result;
    },

    async publish(payload) {
      return withProviderSession(async () => {
        const title = payload.title || '제목 없음';
        const rawContent = payload.content || '';
        const openType = mapNaverVisibility(payload.visibility);
        const tags = normalizeNaverTagList(payload.tags);
        const imageUrls = payload.imageUrls || [];
        const relatedImageKeywords = payload.relatedImageKeywords || [];
        const autoUploadImages = payload.autoUploadImages !== false;
        const imageUploadLimit = Number(payload.imageUploadLimit) || 2;

        await naverApi.initBlog();
        const rawCategories = await naverApi.getCategories();
        const categories = Object.entries(rawCategories).map(([name, id]) => ({ name, id: Number(id) })).sort((a, b) => a.id - b.id);

        // 카테고리 결정
        let categoryNo = payload.category;
        if (categoryNo === undefined || categoryNo === null || String(categoryNo).trim() === '') {
          if (categories.length === 0) {
            categoryNo = '0';
          } else if (categories.length === 1) {
            categoryNo = String(categories[0].id);
          } else {
            return {
              provider: 'naver',
              mode: 'publish',
              status: 'need_category',
              loggedIn: true,
              title,
              openType,
              tags,
              message: '발행을 위해 카테고리가 필요합니다. categories를 확인하고 category를 지정해 주세요.',
              categories,
            };
          }
        }
        categoryNo = String(categoryNo);

        // 이미지 업로드 (imageUrls + relatedImageKeywords 기반 자동 검색)
        let imageComponents = [];
        const hasImageSources = imageUrls.length > 0 || relatedImageKeywords.length > 0;
        if (autoUploadImages && hasImageSources) {
          const token = await naverApi.getToken(categoryNo);
          const uploadResult = await collectAndUploadImages(naverApi, {
            imageUrls,
            relatedImageKeywords,
            token,
            imageUploadLimit,
          });
          imageComponents = uploadResult.components;
        }

        // HTML → 에디터 컴포넌트 변환
        const contentComponents = await convertHtmlToEditorComponents(naverApi, rawContent, imageComponents);

        const result = await naverApi.publishPost({
          title,
          content: contentComponents,
          categoryNo,
          tags,
          openType,
        });

        return {
          provider: 'naver',
          mode: 'publish',
          title,
          category: categoryNo,
          openType,
          tags,
          imageCount: imageComponents.length,
          url: result.entryUrl || null,
          raw: result,
        };
      });
    },

    async saveDraft(payload) {
      // 네이버는 임시저장 API가 없으므로 비공개(openType: 0)로 발행
      return this.publish({
        ...payload,
        visibility: 'private',
      });
    },

    async listCategories() {
      return withProviderSession(async () => {
        await naverApi.initBlog();
        const rawCategories = await naverApi.getCategories();
        return {
          provider: 'naver',
          categories: Object.entries(rawCategories).map(([name, id]) => ({
            name,
            id: Number(id),
          })),
        };
      });
    },

    async listPosts({ limit = 20 } = {}) {
      return withProviderSession(async () => {
        await naverApi.initBlog();
        const result = await naverApi.getPosts({ countPerPage: Math.max(1, Number(limit) || 20) });
        const items = Array.isArray(result?.items) ? result.items : [];
        return {
          provider: 'naver',
          totalCount: result.totalCount || items.length,
          posts: items.slice(0, Math.max(1, Number(limit) || 20)),
        };
      });
    },

    async getPost({ postId } = {}) {
      return withProviderSession(async () => {
        const resolvedPostId = String(postId || '').trim();
        if (!resolvedPostId) {
          return {
            provider: 'naver',
            mode: 'post',
            status: 'invalid_post_id',
            message: 'postId가 필요합니다.',
          };
        }

        await naverApi.initBlog();
        const post = await naverApi.getPost({ postId: resolvedPostId });
        if (!post) {
          return {
            provider: 'naver',
            mode: 'post',
            status: 'not_found',
            postId: resolvedPostId,
            message: '해당 postId의 글을 찾을 수 없습니다.',
          };
        }
        return {
          provider: 'naver',
          mode: 'post',
          postId: resolvedPostId,
          post,
        };
      });
    },

    async logout() {
      clearProviderMeta('naver');
      return {
        provider: 'naver',
        loggedOut: true,
        sessionPath,
      };
    },
  };
};

module.exports = createNaverProvider;
