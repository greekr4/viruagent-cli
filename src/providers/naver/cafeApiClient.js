const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CAFE_MOBILE_BASE = 'https://apis.naver.com/cafe-web/cafe-mobile';
const CAFE_EDITOR_BASE = 'https://apis.cafe.naver.com/editor';
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const PC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const createError = (code, message, hint) => {
  const err = new Error(message);
  err.code = code;
  if (hint) err.hint = hint;
  return err;
};

const readSessionCookies = (sessionPath) => {
  const resolvedPath = path.resolve(sessionPath);
  if (!fs.existsSync(resolvedPath)) {
    throw createError('SESSION_NOT_FOUND', `Session file not found: ${resolvedPath}`, 'viruagent-cli login --provider naver');
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
  } catch (e) {
    throw createError('SESSION_PARSE_ERROR', `Failed to parse session: ${e.message}`);
  }
  const cookies = Array.isArray(raw?.cookies) ? raw.cookies : [];
  const naverCookies = cookies
    .filter((c) => c && c.name && c.value !== undefined && c.value !== null)
    .filter((c) => {
      if (!c.domain) return true;
      return String(c.domain).includes('naver.com');
    })
    .map((c) => `${c.name}=${c.value}`);
  if (!naverCookies.length) {
    throw createError('NO_COOKIES', 'No valid naver cookies found', 'viruagent-cli login --provider naver');
  }
  return naverCookies.join('; ');
};

const createCafeApiClient = ({ sessionPath }) => {
  const getCookieStr = () => readSessionCookies(sessionPath);

  const mobileHeaders = (cookieStr) => ({
    Cookie: cookieStr,
    'User-Agent': MOBILE_UA,
    Referer: 'https://m.cafe.naver.com/',
    Accept: 'application/json, text/plain, */*',
    'x-cafe-product': 'mweb',
  });

  const pcHeaders = (cookieStr) => ({
    Cookie: cookieStr,
    'User-Agent': PC_UA,
    Referer: 'https://cafe.naver.com/',
    Accept: 'application/json, text/plain, */*',
    'X-Cafe-Product': 'pc',
  });

  const apiGet = async (url, headers) => {
    const res = await fetch(url, {
      method: 'GET',
      headers,
      redirect: 'follow',
    });
    const text = await res.text();
    try {
      return { status: res.status, data: JSON.parse(text) };
    } catch {
      return { status: res.status, data: null, raw: text };
    }
  };

  const apiPost = async (url, body, headers) => {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      redirect: 'follow',
    });
    const text = await res.text();
    try {
      return { status: res.status, data: JSON.parse(text) };
    } catch {
      return { status: res.status, data: null, raw: text };
    }
  };

  // ── cafeId 추출 ──

  const extractCafeId = async (cafeUrl) => {
    const cookieStr = getCookieStr();
    // cafeUrl can be full URL or slug
    const slug = cafeUrl.replace(/^https?:\/\/(m\.)?cafe\.naver\.com\/?/, '').replace(/\/$/, '').split('/')[0];
    if (!slug) throw createError('INVALID_CAFE_URL', 'Could not extract cafe slug from URL');

    // Try mobile URL first
    const mobileUrl = `https://m.cafe.naver.com/ca-fe/${slug}`;
    const res = await fetch(mobileUrl, {
      method: 'GET',
      headers: { Cookie: cookieStr, 'User-Agent': MOBILE_UA },
      redirect: 'follow',
    });
    const html = await res.text();

    let match =
      html.match(/g_sClubId\s*=\s*["']?(\d+)/) ||
      html.match(/"clubId"\s*:\s*(\d+)/) ||
      html.match(/"cafeId"\s*:\s*(\d+)/) ||
      html.match(/clubid=(\d+)/i) ||
      html.match(/cafes\/(\d+)/);
    if (match) return { cafeId: match[1], slug };

    // Try desktop URL
    const desktopUrl = `https://cafe.naver.com/${slug}`;
    const res2 = await fetch(desktopUrl, {
      method: 'GET',
      headers: { Cookie: cookieStr, 'User-Agent': PC_UA },
      redirect: 'follow',
    });
    const html2 = await res2.text();
    match =
      html2.match(/g_sClubId\s*=\s*["']?(\d+)/) ||
      html2.match(/"clubId"\s*:\s*(\d+)/) ||
      html2.match(/"cafeId"\s*:\s*(\d+)/) ||
      html2.match(/clubid=(\d+)/i);
    if (match) return { cafeId: match[1], slug };

    throw createError('CAFE_ID_NOT_FOUND', `Could not extract cafeId from ${cafeUrl}`);
  };

  // ── 카페 가입 ──

  const getJoinForm = async (cafeId) => {
    const cookieStr = getCookieStr();
    const url = `${CAFE_MOBILE_BASE}/CafeApplyView.json?cafeId=${cafeId}`;
    const res = await apiGet(url, mobileHeaders(cookieStr));

    if (res.data?.message?.status !== '200') {
      const errCode = res.data?.message?.error?.code || '';
      const errMsg = res.data?.message?.error?.msg || '';
      if (errCode === '3001' || errMsg.includes('이미 회원')) {
        throw createError('ALREADY_JOINED', `Already a member of cafe ${cafeId}`);
      }
      throw createError('CAFE_APPLY_VIEW_FAILED', `CafeApplyView failed: ${errCode} ${errMsg}`);
    }

    const result = res.data.message.result;
    return {
      applyType: result.applyType,
      cafeName: result.mobileCafeApplyProfileInfo?.cafeName || '',
      nickname: result.mobileCafeApplyBodyInfo?.nickname || '',
      clubTempId: result.mobileCafeApplyBodyInfo?.clubTempId || '',
      alimCode: result.mobileCafeApplyBodyInfo?.alimCode || '',
      lastsetno: result.mobileCafeApplyBodyInfo?.lastsetno || 0,
      applyQuestions: result.mobileCafeApplyBodyInfo?.applyQuestions || [],
      needCaptcha: result.mobileCafeApplyCaptcha?.needCaptcha || false,
      captchaKey: result.mobileCafeApplyCaptcha?.captchaKey || '',
      captchaImageUrl: result.mobileCafeApplyCaptcha?.captchaImageUrl || '',
    };
  };

  const checkNickname = async (cafeId, nickname) => {
    const cookieStr = getCookieStr();
    const url = `${CAFE_MOBILE_BASE}/CafeMemberNicknameValid.json?cafeId=${cafeId}&nickname=${encodeURIComponent(nickname)}`;
    const res = await apiGet(url, mobileHeaders(cookieStr));
    return res.data?.message?.status === '200';
  };

  const validateCaptcha = async (captchaKey, captchaValue) => {
    const cookieStr = getCookieStr();
    const url = `${CAFE_MOBILE_BASE}/CaptchaValidate.json?captchaKey=${encodeURIComponent(captchaKey)}&captchaValue=${encodeURIComponent(captchaValue)}&captchaType=image`;
    const res = await apiGet(url, mobileHeaders(cookieStr));

    if (res.data?.message?.status === '200') {
      const result = res.data.message.result || {};
      return {
        valid: result.valid,
        captchaKey: result.captchaKey || null,
        captchaImageUrl: result.captchaImageUrl || null,
      };
    }
    return { valid: false, captchaKey: null, captchaImageUrl: null };
  };

  const downloadCaptchaImage = async (captchaImageUrl) => {
    const cookieStr = getCookieStr();
    const res = await fetch(captchaImageUrl, {
      headers: {
        Cookie: cookieStr,
        'User-Agent': MOBILE_UA,
        Referer: 'https://m.cafe.naver.com/',
      },
    });
    if (!res.ok) throw createError('CAPTCHA_DOWNLOAD_FAILED', `Failed to download captcha image: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    return buffer.toString('base64');
  };

  const submitJoin = async (cafeId, { alimCode, clubTempId, applyPayload }) => {
    const cookieStr = getCookieStr();
    const queryParams = new URLSearchParams({
      cafeId,
      alimCode,
      clubTempId,
      requestFrom: 'B',
    });
    const url = `${CAFE_MOBILE_BASE}/CafeApply.json?${queryParams}`;
    const body = `applyRequestJson=${encodeURIComponent(JSON.stringify(applyPayload))}`;
    const referer = `https://m.cafe.naver.com/ca-fe/web/cafes/${cafeId}/join`;

    const headers = {
      ...mobileHeaders(cookieStr),
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: referer,
    };

    const res = await apiPost(url, body, headers);

    if (res.data?.message?.status === '200' || (res.raw === '' || res.raw?.trim() === '')) {
      return { success: true, message: 'Success' };
    }

    const errCode = res.data?.message?.error?.code || '';
    const errMsg = res.data?.message?.error?.msg || '';
    throw createError('CAFE_JOIN_FAILED', `Join failed: ${errCode} ${errMsg}`.trim());
  };

  // ── 카페 게시판 목록 ──

  const getBoardList = async (cafeId) => {
    const cookieStr = getCookieStr();

    // Primary: cafe2 SideMenuList API (PC)
    const url = `https://apis.naver.com/cafe-web/cafe2/SideMenuList?cafeId=${cafeId}`;
    const res = await apiGet(url, pcHeaders(cookieStr));
    if (res.data?.message?.status === '200') {
      const menus = res.data.message.result?.menus || [];
      const writable = menus.filter((m) => m.menuType === 'B');
      return writable.map((m) => ({
        boardId: m.menuId,
        name: m.menuName,
        boardType: m.boardType,
      }));
    }

    // Fallback: mobile boardlist API
    const url2 = `https://apis.naver.com/cafe-web/cafe-boardlist-api/v1/cafes/${cafeId}/boardlist`;
    const res2 = await apiGet(url2, mobileHeaders(cookieStr));
    if (res2.data?.message?.status === '200') {
      const boards = res2.data.message.result?.boardList || [];
      return boards.map((b) => ({
        boardId: b.menuId,
        name: b.menuName,
        boardType: b.boardType,
      }));
    }

    throw createError('BOARD_LIST_FAILED', `Could not fetch board list for cafe ${cafeId}`);
  };

  // ── 카페 이미지 업로드 ──

  const PHOTO_SESSION_URL = 'https://apis.naver.com/cafe-web/cafe-mobile/PhotoInfraSessionKey.json';
  const PHOTO_UPLOAD_DOMAIN = 'cafe.upphoto.naver.com';

  const getPhotoSessionKey = async () => {
    const cookieStr = getCookieStr();
    const res = await apiPost(PHOTO_SESSION_URL, '', pcHeaders(cookieStr));
    const key = res.data?.message?.result;
    if (!key) throw createError('PHOTO_SESSION_FAILED', 'Failed to get photo session key');
    return key;
  };

  const uploadImage = async (sessionKey, imageBuffer, fileName, userId = '') => {
    const boundary = `----FormBoundary${crypto.randomUUID().replace(/-/g, '')}`;
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${fileName}"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      imageBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const uploadUrl =
      `https://${PHOTO_UPLOAD_DOMAIN}/${sessionKey}/simpleUpload/0` +
      `?userId=${userId}&extractExif=true&extractAnimatedCnt=true&autorotate=true` +
      `&extractDominantColor=false&denyAnimatedImage=false&skipXcamFiltering=false`;

    const cookieStr = getCookieStr();
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Cookie: cookieStr,
        'User-Agent': PC_UA,
        Referer: 'https://cafe.naver.com/',
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    const text = await res.text();
    const result = {};

    // Parse pipe-delimited response: url=...|width=800|height=600|...
    if (text.includes('|')) {
      for (const pair of text.split('|')) {
        const idx = pair.indexOf('=');
        if (idx > 0) result[pair.slice(0, idx)] = pair.slice(idx + 1);
      }
    }

    if (!result.url) throw createError('IMAGE_UPLOAD_FAILED', `Image upload failed: ${text.slice(0, 200)}`);

    for (const k of ['width', 'height', 'fileSize']) {
      if (result[k]) result[k] = parseInt(result[k], 10) || 0;
    }
    return result;
  };

  const createImageComponent = (imgData, link) => {
    const seId = () => `SE-${crypto.randomUUID()}`;
    const url = imgData.url || '';
    let domain = 'https://cafeptthumb-phinf.pstatic.net';
    let imgPath = url;
    if (url.startsWith('http')) {
      const u = new URL(url);
      domain = `${u.protocol}//${u.host}`;
      imgPath = u.pathname;
    }
    const comp = {
      id: seId(),
      layout: 'default',
      align: 'center',
      src: `${domain}${imgPath}?type=w1`,
      internalResource: true,
      represent: imgData.represent || false,
      path: imgPath,
      domain,
      fileSize: imgData.fileSize || 0,
      width: imgData.width || 800,
      widthPercentage: 0,
      height: imgData.height || 600,
      originalWidth: imgData.width || 800,
      originalHeight: imgData.height || 600,
      fileName: imgData.fileName || 'image.jpg',
      caption: null,
      format: 'normal',
      displayFormat: 'normal',
      imageLoaded: true,
      contentMode: 'normal',
      origin: { srcFrom: 'local', '@ctype': 'imageOrigin' },
      ai: false,
      '@ctype': 'image',
    };
    if (link) comp.link = link;
    return comp;
  };

  const createImageGroup = (imagesData, layout = 'slide') => {
    const _id = () => `SE-${crypto.randomUUID()}`;
    const isCollage = layout === 'collage';
    const numImages = imagesData.length;

    const images = imagesData.map((imgData, idx) => {
      const url = imgData.url || '';
      let domain = 'https://cafeptthumb-phinf.pstatic.net';
      let imgPath = url;
      if (url.startsWith('http')) {
        const u = new URL(url);
        domain = `${u.protocol}//${u.host}`;
        imgPath = u.pathname;
      }

      const typeSuffix = isCollage ? '?type=w1600' : '?type=w1';
      const imgWidth = isCollage ? (imgData.width || 800) : 693;
      const contentMode = isCollage ? 'extend' : 'fit';

      let widthPct = 0;
      if (isCollage) {
        if (numImages === 1) widthPct = 100;
        else if (idx < numImages - (numImages % 2)) widthPct = 50;
        else widthPct = 100;
      }

      return {
        id: _id(),
        layout: 'default',
        src: `${domain}${imgPath}${typeSuffix}`,
        internalResource: true,
        represent: idx === 0,
        path: imgPath,
        domain,
        fileSize: imgData.fileSize || 0,
        width: imgWidth,
        widthPercentage: widthPct,
        height: imgData.height || 600,
        originalWidth: imgData.width || 800,
        originalHeight: imgData.height || 600,
        fileName: imgData.fileName || 'image.jpg',
        caption: null,
        format: 'normal',
        displayFormat: 'normal',
        contentMode,
        origin: { srcFrom: 'local', '@ctype': 'imageOrigin' },
        ai: false,
        '@ctype': 'image',
      };
    });

    return {
      id: _id(),
      layout,
      contentMode: 'extend',
      caption: null,
      images,
      '@ctype': 'imageGroup',
    };
  };

  // ── 카페 글쓰기 ──

  const seId = () => `SE-${crypto.randomUUID()}`;

  const getEditorInfo = async (cafeId, menuId) => {
    const cookieStr = getCookieStr();
    const url = `${CAFE_EDITOR_BASE}/v2/cafes/${cafeId}/editor?menuId=${menuId}&from=pc`;
    const res = await apiGet(url, pcHeaders(cookieStr));
    const data = res.data?.result || res.data || {};
    if (!data.token) {
      throw createError('EDITOR_INIT_FAILED', `Editor init failed for cafe ${cafeId}, menu ${menuId}`);
    }
    return data;
  };

  const htmlToComponents = async (htmlContent) => {
    // Use Naver upconvert API
    const cookieStr = getCookieStr();
    const wrapped = `<html>\n<body>\n<!--StartFragment-->\n${htmlContent}\n<!--EndFragment-->\n</body>\n</html>`;
    const res = await fetch(
      'https://upconvert.editor.naver.com/blog/html/components?documentWidth=800',
      {
        method: 'POST',
        headers: {
          Cookie: cookieStr,
          'Content-Type': 'text/html; charset=utf-8',
          'User-Agent': PC_UA,
        },
        body: Buffer.from(wrapped, 'utf-8'),
      },
    );

    if (res.ok) {
      const result = await res.json();
      if (Array.isArray(result) && result.length > 0) return result;
    }

    // Fallback: simple text component
    const cleanText = htmlContent.replace(/<[^>]*>/g, '').trim();
    if (!cleanText) return [];
    return [{
      id: seId(),
      layout: 'default',
      value: [{
        id: seId(),
        nodes: [{
          id: seId(),
          value: cleanText,
          style: { fontColor: '#333333', fontSizeCode: 'fs16', bold: 'false', '@ctype': 'nodeStyle' },
          '@ctype': 'textNode',
        }],
        style: { align: 'left', lineHeight: '1.8', '@ctype': 'paragraphStyle' },
        '@ctype': 'paragraph',
      }],
      '@ctype': 'text',
    }];
  };

  const buildContentJson = (components) => {
    return JSON.stringify({
      document: {
        version: '2.9.0',
        theme: 'default',
        language: 'ko-KR',
        id: seId(),
        components,
      },
      documentId: '',
    });
  };

  const postArticle = async (cafeId, menuId, title, contentJson, tags, options) => {
    const cookieStr = getCookieStr();
    const url = `${CAFE_EDITOR_BASE}/v2.0/cafes/${cafeId}/menus/${menuId}/articles`;
    const opts = options || {};
    const body = {
      article: {
        cafeId: String(cafeId),
        contentJson,
        from: 'pc',
        menuId: Number(menuId),
        subject: title.trim(),
        tagList: tags || [],
        editorVersion: 4,
        parentId: 0,
        open: opts.open || false,
        naverOpen: opts.naverOpen !== undefined ? opts.naverOpen : true,
        externalOpen: opts.externalOpen !== undefined ? opts.externalOpen : true,
        enableComment: opts.enableComment !== undefined ? opts.enableComment : true,
        enableScrap: opts.enableScrap || false,
        enableCopy: opts.enableCopy || false,
        useAutoSource: opts.useAutoSource !== undefined ? opts.useAutoSource : true,
        cclTypes: opts.cclTypes || [],
        useCcl: false,
      },
    };

    const headers = {
      ...pcHeaders(cookieStr),
      'Content-Type': 'application/json',
      Origin: 'https://cafe.naver.com',
    };

    const res = await apiPost(url, JSON.stringify(body), headers);

    if (res.status === 200) {
      const data = res.data?.result || res.data || {};
      const articleId = data.articleId;
      if (articleId) {
        return {
          articleId,
          articleUrl: `https://cafe.naver.com/ca-fe/cafes/${cafeId}/articles/${articleId}`,
        };
      }
      return { articleId: null, articleUrl: null, raw: res.data };
    }

    const errInfo = res.data?.error || {};
    throw createError(
      'CAFE_WRITE_FAILED',
      `Cafe post failed: HTTP ${res.status} [${errInfo.errorCode || ''}] ${errInfo.message || ''}`.trim(),
    );
  };

  return {
    extractCafeId,
    getJoinForm,
    checkNickname,
    validateCaptcha,
    downloadCaptchaImage,
    submitJoin,
    getBoardList,
    getEditorInfo,
    htmlToComponents,
    buildContentJson,
    postArticle,
    getPhotoSessionKey,
    uploadImage,
    createImageComponent,
    createImageGroup,
  };
};

module.exports = createCafeApiClient;
