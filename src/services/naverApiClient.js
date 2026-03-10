const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const BLOG_HOST = 'https://blog.naver.com';

const getTimeout = () => 20000;

const normalizeCookies = (session) => {
  if (!session) return [];

  const rawCookies = Array.isArray(session)
    ? session
    : Array.isArray(session.cookies)
      ? session.cookies
      : [];

  return rawCookies
    .filter((c) => c && typeof c === 'object')
    .filter((c) => c.name && c.value !== undefined && c.value !== null)
    .filter((c) => {
      if (!c.domain) return true;
      return String(c.domain).includes('naver.com');
    })
    .map((c) => `${c.name}=${c.value}`);
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

const createFetchController = () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeout());
  return { controller, timeout };
};

const createNaverApiClient = ({ sessionPath }) => {
  let blogId = null;

  const resetState = () => {
    blogId = null;
  };

  const getSessionCookies = () => readSessionCookies(sessionPath);

  const getHeaders = (opts = {}) => ({
    Cookie: getSessionCookies(),
    'User-Agent': USER_AGENT,
    Accept: 'application/json',
    ...opts,
  });

  const encodeRefererUrl = (id, categoryNo = '0', extra = '') => {
    const base = `${BLOG_HOST}/PostWriteForm.naver?blogId=${encodeURIComponent(id)}&categoryNo=${encodeURIComponent(categoryNo)}`;
    return extra ? `${base}&${extra}` : base;
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
        } catch {}
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

  const initBlog = async () => {
    if (blogId) return blogId;

    const html = await requestText(`${BLOG_HOST}/MyBlog.naver`, {
      headers: getHeaders({ Referer: BLOG_HOST }),
    });

    const match = html.match(/blogId\s*=\s*'([^']+)'/);
    if (!match) {
      // JSON 응답인 경우도 체크
      if (html.includes('로그인') || html.includes('login')) {
        throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.');
      }
      throw new Error('MyBlog 응답에서 blogId를 찾을 수 없습니다.');
    }

    blogId = match[1];
    return blogId;
  };

  const getToken = async (categoryNo = '0') => {
    const id = blogId || await initBlog();
    const json = await requestJson(
      `${BLOG_HOST}/PostWriteFormSeOptions.naver?blogId=${encodeURIComponent(id)}&categoryNo=${encodeURIComponent(categoryNo)}`,
      {
        headers: getHeaders({
          Referer: encodeRefererUrl(id, categoryNo, 'Redirect=Write'),
        }),
      }
    );
    const token = json?.result?.token;
    if (!token) throw new Error('Se-Authorization 토큰을 가져올 수 없습니다.');
    return token;
  };

  const getCategories = async () => {
    const id = blogId || await initBlog();
    const json = await requestJson(
      `${BLOG_HOST}/PostWriteFormManagerOptions.naver?blogId=${encodeURIComponent(id)}&categoryNo=0`,
      {
        headers: getHeaders({
          Referer: encodeRefererUrl(id, '0'),
        }),
      }
    );

    const categoryList = json?.result?.formView?.categoryListFormView?.categoryFormViewList;
    if (!Array.isArray(categoryList)) return {};

    const result = {};
    for (const cat of categoryList) {
      if (cat.categoryName && cat.categoryNo !== undefined) {
        result[cat.categoryName] = Number(cat.categoryNo);
      }
    }
    return result;
  };

  const getEditorInfo = async (categoryNo = '0') => {
    const id = blogId || await initBlog();
    const token = await getToken(categoryNo);

    const configJson = await requestJson(
      'https://platform.editor.naver.com/api/blogpc001/v1/service_config',
      {
        headers: getHeaders({
          Referer: encodeRefererUrl(id, categoryNo),
          'Se-Authorization': token,
        }),
      }
    );
    const editorId = configJson?.editorInfo?.id;
    if (!editorId) throw new Error('에디터 ID를 가져올 수 없습니다.');

    const managerJson = await requestJson(
      `${BLOG_HOST}/PostWriteFormManagerOptions.naver?blogId=${encodeURIComponent(id)}&categoryNo=${encodeURIComponent(categoryNo)}`,
      {
        headers: getHeaders({
          Referer: encodeRefererUrl(id, categoryNo),
        }),
      }
    );
    const editorSource = managerJson?.result?.formView?.editorSource;

    return { editorId, editorSource: editorSource || 'blogpc001', token };
  };

  const getUploadSessionKey = async (token) => {
    const json = await requestJson(
      'https://platform.editor.naver.com/api/blogpc001/v1/photo-uploader/session-key',
      {
        headers: getHeaders({
          Referer: encodeRefererUrl(blogId || '', '0'),
          'Se-Authorization': token,
        }),
      }
    );
    return json?.sessionKey || null;
  };

  const uploadImage = async (imageBuffer, filename, token) => {
    const id = blogId || await initBlog();
    const sessionKey = await getUploadSessionKey(token);
    if (!sessionKey) throw new Error('이미지 업로드 세션 키를 가져올 수 없습니다.');

    const uploadUrl = `https://blog.upphoto.naver.com/${sessionKey}/simpleUpload/0?userId=${encodeURIComponent(id)}&extractExif=true&extractAnimatedCnt=true&autorotate=true&extractDominantColor=false&denyAnimatedImage=false&skipXcamFiltering=false`;

    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
    formData.append('image', blob, filename || 'image.jpg');

    const { controller, timeout } = createFetchController();
    try {
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Cookie: getSessionCookies(),
          'User-Agent': USER_AGENT,
          Referer: `${BLOG_HOST}/${encodeURIComponent(id)}`,
        },
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`이미지 업로드 실패: ${response.status}`);
      }

      const xml = await response.text();
      if (!xml.includes('<url>')) {
        throw new Error('이미지 업로드 응답에 URL이 없습니다.');
      }

      const extractTag = (tag) => {
        const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
        return m ? m[1] : null;
      };

      return {
        url: extractTag('url'),
        width: parseInt(extractTag('width') || '600', 10),
        height: parseInt(extractTag('height') || '400', 10),
        fileName: extractTag('fileName') || filename || 'image.jpg',
        fileSize: parseInt(extractTag('fileSize') || '0', 10),
      };
    } finally {
      clearTimeout(timeout);
    }
  };

  const convertHtmlToComponents = async (html) => {
    const id = blogId || await initBlog();
    const wrappedHtml = `<html>\n<body>\n<!--StartFragment-->\n${html}\n<!--EndFragment-->\n</body>\n</html>`;

    const { controller, timeout } = createFetchController();
    try {
      const response = await fetch(
        `https://upconvert.editor.naver.com/blog/html/components?documentWidth=886&userId=${encodeURIComponent(id)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'User-Agent': USER_AGENT,
            Cookie: getSessionCookies(),
          },
          body: wrappedHtml,
          signal: controller.signal,
        }
      );

      if (!response.ok) return [];
      return response.json();
    } catch {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  };

  const getDefaultCategoryNo = async () => {
    const id = blogId || await initBlog();
    const json = await requestJson(
      `${BLOG_HOST}/PostWriteFormManagerOptions.naver?blogId=${encodeURIComponent(id)}&categoryNo=0`,
      { headers: getHeaders({ Referer: encodeRefererUrl(id, '0') }) }
    );
    const defaultId = json?.result?.formView?.categoryListFormView?.defaultCategoryId;
    return defaultId !== undefined && defaultId !== null ? String(defaultId) : '1';
  };

  const publishPost = async ({ title, content, categoryNo, tags = '', openType = 2 }) => {
    const id = blogId || await initBlog();
    const resolvedCategoryNo = categoryNo && String(categoryNo) !== '0'
      ? String(categoryNo)
      : await getDefaultCategoryNo();
    const { editorId, editorSource, token } = await getEditorInfo(resolvedCategoryNo);

    // content가 이미 컴포넌트 배열이면 그대로 사용, 아니면 빈 배열
    const contentComponents = Array.isArray(content) ? content : [];

    const titleComponent = {
      id: `SE-${crypto.randomUUID()}`,
      layout: 'default',
      title: [{
        id: `SE-${crypto.randomUUID()}`,
        nodes: [{
          id: `SE-${crypto.randomUUID()}`,
          value: title,
          '@ctype': 'textNode',
        }],
        '@ctype': 'paragraph',
      }],
      subTitle: null,
      align: 'left',
      '@ctype': 'documentTitle',
    };

    const documentModel = {
      documentId: '',
      document: {
        version: '2.9.0',
        theme: 'default',
        language: 'ko-KR',
        id: editorId,
        components: [titleComponent, ...contentComponents],
      },
    };

    const populationParams = {
      configuration: {
        openType,
        commentYn: true,
        searchYn: true,
        sympathyYn: true,
        scrapType: 2,
        outSideAllowYn: true,
        twitterPostingYn: false,
        facebookPostingYn: false,
        cclYn: false,
      },
      populationMeta: {
        categoryId: resolvedCategoryNo,
        logNo: null,
        directorySeq: 0,
        directoryDetail: null,
        mrBlogTalkCode: null,
        postWriteTimeType: 'now',
        tags: tags || '',
        moviePanelParticipation: false,
        greenReviewBannerYn: false,
        continueSaved: false,
        noticePostYn: false,
        autoByCategoryYn: false,
        postLocationSupportYn: false,
        postLocationJson: null,
        prePostDate: null,
        thisDayPostInfo: null,
        scrapYn: false,
      },
      editorSource,
    };

    const body = new URLSearchParams({
      blogId: id,
      documentModel: JSON.stringify(documentModel),
      populationParams: JSON.stringify(populationParams),
      productApiVersion: 'v1',
    });

    const { controller, timeout } = createFetchController();
    try {
      const response = await fetch(`${BLOG_HOST}/RabbitWrite.naver`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: getSessionCookies(),
          'User-Agent': USER_AGENT,
          Referer: encodeRefererUrl(id, resolvedCategoryNo, 'Redirect=Write'),
        },
        body: body.toString(),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`글 발행 실패: ${response.status}`);
      }

      const json = await response.json();
      if (!json.isSuccess) {
        throw new Error(`글 발행 실패: ${JSON.stringify(json).slice(0, 200)}`);
      }

      const redirectUrl = json.result?.redirectUrl || '';
      const blogUrlMatch = redirectUrl.match(/blogId=([^&]+)/) || [];
      const logNoMatch = redirectUrl.match(/logNo=([^&]+)/) || [];
      const finalBlogId = blogUrlMatch[1] || id;
      const logNo = logNoMatch[1] || '';

      return {
        success: true,
        entryUrl: logNo ? `https://blog.naver.com/${finalBlogId}/${logNo}` : null,
        redirectUrl,
        raw: json,
      };
    } finally {
      clearTimeout(timeout);
    }
  };

  const getPosts = async ({ page = 1, countPerPage = 20 } = {}) => {
    const id = blogId || await initBlog();
    const text = await requestText(
      `${BLOG_HOST}/PostTitleListAsync.naver?blogId=${encodeURIComponent(id)}&viewdate=&currentPage=${page}&categoryNo=0&parentCategoryNo=0&countPerPage=${countPerPage}`,
      {
        headers: getHeaders({ Referer: `${BLOG_HOST}/${id}` }),
      }
    );

    let json;
    try {
      // 네이버 응답에 잘못된 이스케이프(\')가 포함될 수 있어 정리
      const sanitized = text.replace(/\\'/g, "'");
      json = JSON.parse(sanitized);
    } catch {
      return { items: [], totalCount: 0 };
    }

    const postList = Array.isArray(json?.postList) ? json.postList : [];
    const items = postList.map((p) => {
      let title = p.title || '';
      try { title = decodeURIComponent(title.replace(/\+/g, ' ')); } catch { /* use as-is */ }
      return {
        id: p.logNo,
        title,
        categoryNo: p.categoryNo,
        readCount: p.readCount,
        addDate: p.addDate,
        openType: p.openType,
      };
    });
    return { items, totalCount: items.length };
  };

  const getPost = async ({ postId } = {}) => {
    if (!postId) return null;
    const id = blogId || await initBlog();
    const html = await requestText(
      `${BLOG_HOST}/PostView.naver?blogId=${encodeURIComponent(id)}&logNo=${encodeURIComponent(postId)}`,
      {
        headers: getHeaders({ Referer: `${BLOG_HOST}/${id}` }),
      }
    );
    if (!html || html.includes('존재하지 않는 포스트')) return null;

    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    return {
      id: String(postId),
      title: titleMatch ? titleMatch[1].replace(/\s*:.*$/, '').trim() : '',
      url: `${BLOG_HOST}/${id}/${postId}`,
      html: html.slice(0, 5000),
    };
  };

  return {
    initBlog,
    getToken,
    getCategories,
    getEditorInfo,
    getUploadSessionKey,
    uploadImage,
    convertHtmlToComponents,
    publishPost,
    getPosts,
    getPost,
    resetState,
  };
};

module.exports = createNaverApiClient;
