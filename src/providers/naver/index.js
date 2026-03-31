const { saveProviderMeta, clearProviderMeta, getProviderMeta } = require('../../storage/sessionStore');
const createNaverApiClient = require('../../services/naverApiClient');
const createCafeApiClient = require('./cafeApiClient');
const {
  readNaverCredentials,
  normalizeNaverTagList,
  mapNaverVisibility,
} = require('./utils');
const { convertHtmlToEditorComponents } = require('./editorConvert');
const { collectAndUploadImages } = require('./imageUpload');
const { createNaverWithProviderSession } = require('./session');
const { createAskForAuthentication } = require('./auth');

const createNaverProvider = ({ sessionPath, account }) => {
  const naverApi = createNaverApiClient({ sessionPath });
  const cafeApi = createCafeApiClient({ sessionPath });

  const askForAuthentication = createAskForAuthentication({
    sessionPath,
    naverApi,
  });

  const withProviderSession = createNaverWithProviderSession(askForAuthentication, account);

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
            metadata: getProviderMeta('naver', account) || {},
          };
        } catch (error) {
          return {
            provider: 'naver',
            loggedIn: false,
            sessionPath,
            error: error.message,
            metadata: getProviderMeta('naver', account) || {},
          };
        }
      });
    },

    async login({
      headless = false,
      manual = false,
      username,
      password,
    } = {}) {
      const creds = readNaverCredentials();
      const resolved = {
        headless,
        manual,
        username: username || creds.username,
        password: password || creds.password,
      };

      const result = await askForAuthentication(resolved);
      saveProviderMeta('naver', {
        loggedIn: result.loggedIn,
        blogId: result.blogId,
        blogUrl: result.blogUrl,
        sessionPath: result.sessionPath,
      }, account);
      return result;
    },

    async publish(payload) {
      return withProviderSession(async () => {
        const title = payload.title || 'Untitled';
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

        // Determine category
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
              message: 'A category is required for publishing. Please check categories and specify a category.',
              categories,
            };
          }
        }
        categoryNo = String(categoryNo);

        // Image upload (auto-search based on imageUrls + relatedImageKeywords)
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

        // Convert HTML to editor components
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
      // Naver has no draft API, so publish as private (openType: 0)
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
            message: 'postId is required.',
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
            message: 'Post not found for the given postId.',
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
      clearProviderMeta('naver', account);
      return {
        provider: 'naver',
        loggedOut: true,
        sessionPath,
      };
    },

    // ── Cafe methods ──

    async cafeId({ cafeUrl } = {}) {
      return withProviderSession(async () => {
        if (!cafeUrl) {
          const err = new Error('cafeUrl is required');
          err.code = 'MISSING_PARAM';
          throw err;
        }
        const { cafeId: id, slug } = await cafeApi.extractCafeId(cafeUrl);
        return { provider: 'naver', cafeId: id, slug, cafeUrl };
      });
    },

    async cafeJoin({ cafeUrl, nickname, captchaValue, captchaKey: inputCaptchaKey, answers } = {}) {
      return withProviderSession(async () => {
        if (!cafeUrl) {
          const err = new Error('cafeUrl is required');
          err.code = 'MISSING_PARAM';
          throw err;
        }

        // 1. Extract cafeId
        const { cafeId: id, slug } = await cafeApi.extractCafeId(cafeUrl);

        // 2. Get join form
        const form = await cafeApi.getJoinForm(id);

        // 3. Determine nickname
        let finalNickname = nickname || form.nickname;
        const nickValid = await cafeApi.checkNickname(id, finalNickname);
        if (!nickValid && !nickname) {
          finalNickname = `user${Math.floor(Math.random() * 9000 + 1000)}`;
        }

        // 4. Handle captcha — prompt user for manual input
        let captchaKey = inputCaptchaKey || form.captchaKey;
        let resolvedCaptchaValue = captchaValue || '';

        if (form.needCaptcha && !resolvedCaptchaValue) {
          return {
            provider: 'naver',
            mode: 'cafe-join',
            status: 'captcha_required',
            cafeId: id,
            slug,
            cafeName: form.cafeName,
            captchaKey: form.captchaKey,
            captchaImageUrl: form.captchaImageUrl,
            nickname: finalNickname,
            message: 'Captcha required. Open the captchaImageUrl in a browser, read the text, and re-run with --captcha-value <text> --captcha-key <key>',
          };
        }

        // Validate captcha if provided
        if (form.needCaptcha && resolvedCaptchaValue) {
          const validateResult = await cafeApi.validateCaptcha(captchaKey, resolvedCaptchaValue);
          if (!validateResult.valid) {
            const newForm = await cafeApi.getJoinForm(id);
            return {
              provider: 'naver',
              mode: 'cafe-join',
              status: 'captcha_invalid',
              cafeId: id,
              slug,
              cafeName: form.cafeName,
              captchaKey: newForm.captchaKey,
              captchaImageUrl: newForm.captchaImageUrl,
              nickname: finalNickname,
              message: 'Captcha answer was wrong. Open the new captchaImageUrl, read the text, and retry with --captcha-value <text> --captcha-key <key>',
            };
          }
        }

        // 5. Build answer list
        const applyAnswerList = (form.applyQuestions || []).map((q, idx) => {
          if (answers && answers[idx] !== undefined) return answers[idx];
          if (q.questionType === 'M' && q.answerExampleList?.length > 0) return q.answerExampleList[0];
          return '네';
        });

        // 6. Build payload
        const applyPayload = {
          applyType: form.applyType,
          applyQuestionSetno: form.lastsetno,
          nickname: finalNickname,
          cafeProfileImagePath: '',
          sexAndAgeConfig: true,
          applyAnswerList,
          applyImageMap: {},
        };

        if (form.needCaptcha && captchaValue) {
          applyPayload.captchaKey = captchaKey;
          applyPayload.captchaValue = captchaValue;
        }

        // 7. Submit
        const result = await cafeApi.submitJoin(id, {
          alimCode: form.alimCode,
          clubTempId: form.clubTempId,
          applyPayload,
        });

        return {
          provider: 'naver',
          mode: 'cafe-join',
          status: form.applyType === 'apply' ? 'applied' : 'joined',
          cafeId: id,
          slug,
          cafeName: form.cafeName,
          nickname: finalNickname,
          applyType: form.applyType,
          captchaSolved: form.needCaptcha,
          questionCount: form.applyQuestions.length,
        };
      });
    },

    async cafeList({ cafeId: inputCafeId, cafeUrl } = {}) {
      return withProviderSession(async () => {
        let resolvedCafeId = inputCafeId;
        let slug;

        if (!resolvedCafeId && cafeUrl) {
          const extracted = await cafeApi.extractCafeId(cafeUrl);
          resolvedCafeId = extracted.cafeId;
          slug = extracted.slug;
        }
        if (!resolvedCafeId) {
          const err = new Error('cafeId or cafeUrl is required');
          err.code = 'MISSING_PARAM';
          throw err;
        }

        const boards = await cafeApi.getBoardList(resolvedCafeId);
        return {
          provider: 'naver',
          mode: 'cafe-list',
          cafeId: resolvedCafeId,
          slug: slug || null,
          boards,
        };
      });
    },

    async cafeWrite({ cafeId: inputCafeId, cafeUrl, boardId, title, content, tags, imageUrls, imageLayout } = {}) {
      return withProviderSession(async () => {
        let resolvedCafeId = inputCafeId;

        if (!resolvedCafeId && cafeUrl) {
          const extracted = await cafeApi.extractCafeId(cafeUrl);
          resolvedCafeId = extracted.cafeId;
        }
        if (!resolvedCafeId) {
          const err = new Error('cafeId or cafeUrl is required');
          err.code = 'MISSING_PARAM';
          throw err;
        }
        if (!boardId) {
          const err = new Error('boardId is required');
          err.code = 'MISSING_PARAM';
          err.hint = 'viruagent-cli cafe-list --provider naver --cafe-id <id>';
          throw err;
        }
        if (!title) {
          const err = new Error('title is required');
          err.code = 'MISSING_PARAM';
          throw err;
        }
        if (!content) {
          const err = new Error('content is required');
          err.code = 'MISSING_PARAM';
          throw err;
        }

        // 1. Get editor info
        const editorInfo = await cafeApi.getEditorInfo(resolvedCafeId, boardId);
        const options = editorInfo.options || {};

        // 2. Convert HTML to SE3 components
        const components = await cafeApi.htmlToComponents(content);
        if (!components.length) {
          const err = new Error('Failed to convert content to editor components');
          err.code = 'CONTENT_CONVERT_FAILED';
          throw err;
        }

        // 2.5. Upload images and insert as components (if imageUrls provided)
        const urls = Array.isArray(imageUrls) ? imageUrls : (imageUrls ? String(imageUrls).split(',').map((u) => u.trim()).filter(Boolean) : []);
        if (urls.length > 0) {
          const sessionKey = await cafeApi.getPhotoSessionKey();
          const userId = editorInfo.userId || '';
          const uploaded = [];
          for (let i = 0; i < urls.length; i++) {
            try {
              const imgRes = await fetch(urls[i]);
              if (!imgRes.ok) continue;
              const buf = Buffer.from(await imgRes.arrayBuffer());
              const fileName = `image_${i + 1}.jpg`;
              const imgData = await cafeApi.uploadImage(sessionKey, buf, fileName, userId);
              if (i === 0) imgData.represent = true;
              uploaded.push(imgData);
            } catch { /* skip failed images */ }
          }

          const layout = imageLayout || 'default';
          if (uploaded.length > 1 && (layout === 'slide' || layout === 'collage')) {
            components.push(cafeApi.createImageGroup(uploaded, layout));
          } else {
            for (const imgData of uploaded) {
              components.push(cafeApi.createImageComponent(imgData));
            }
          }
        }

        // 3. Build contentJson
        const contentJson = cafeApi.buildContentJson(components);

        // 4. Parse tags
        const tagList = tags
          ? (Array.isArray(tags) ? tags : String(tags).split(',').map((t) => t.trim()).filter(Boolean))
          : [];

        // 5. Post article
        const result = await cafeApi.postArticle(resolvedCafeId, boardId, title, contentJson, tagList, options);

        return {
          provider: 'naver',
          mode: 'cafe-write',
          cafeId: resolvedCafeId,
          boardId,
          title,
          articleId: result.articleId,
          articleUrl: result.articleUrl,
          tags: tagList,
        };
      });
    },
  };
};

module.exports = createNaverProvider;
