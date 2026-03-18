const fs = require('fs');
const { loadInstaSession, cookiesToHeader, loadRateLimits, saveRateLimits } = require('./session');
const { IG_APP_ID, USER_AGENT } = require('./auth');

const randomDelay = (minSec, maxSec) => {
  const ms = (minSec + Math.random() * (maxSec - minSec)) * 1000;
  return new Promise((resolve) => setTimeout(resolve, ms));
};

// ──────────────────────────────────────────────────────────────
// Instagram Safe Action Rules (2026, research-based)
//
// [Hourly limits by account age]
//   New (0~20 days)  | Mature (20+ days)
//   Like      15/h   | 60/h
//   Comment    5/h   | 20/h
//   Follow    15/h   | 60/h
//   Unfollow  10/h   | 30/h
//   DM         5/h   | 50/h
//   Publish    3/h   | 10/h
//
// [Daily limits]
//   Like   500/day   Comment 100/day   Follow  250/day
//   Unfollow 200/day DM       30/day   Publish  25/day
//
// [Minimum action intervals (new accounts)]
//   Like: 20~40s | Comment: 300~420s (5~7min) | Follow: 60~120s
//   Unfollow: 60~120s | DM: 120~300s | Publish: 60~120s
//
// [Notes]
//   - Max 15 total actions/hour (new) / 40 (mature)
//   - Uniform intervals trigger bot detection → random delay required
//   - Repeated actions on the same user are prohibited
//   - Challenge requires manual verification in the browser
//   - Wait 24~48 hours after a challenge is recommended
// ──────────────────────────────────────────────────────────────

const DELAY = {
  like:     [20, 40],    // 20~40s
  comment:  [300, 420],  // 5~7min
  follow:   [60, 120],   // 1~2min
  unfollow: [60, 120],   // 1~2min
  dm:       [120, 300],  // 2~5min
  publish:  [60, 120],   // 1~2min
};

const HOURLY_LIMIT = {
  like: 15,
  comment: 5,
  follow: 15,
  unfollow: 10,
  dm: 5,
  publish: 3,
};

const DAILY_LIMIT = {
  like: 500,
  comment: 100,
  follow: 250,
  unfollow: 200,
  dm: 30,
  publish: 25,
};

let lastActionTime = 0;

const createInstaApiClient = ({ sessionPath }) => {
  let cachedCookies = null;
  let cachedUserId = null;
  let countersCache = null;

  // ── Session file-based Rate Limit counters ──

  const loadCounters = () => {
    if (countersCache) return countersCache;
    try {
      const userId = getUserId();
      if (!userId) { countersCache = {}; return countersCache; }
      const saved = loadRateLimits(sessionPath, userId);
      countersCache = saved || {};
    } catch {
      countersCache = {};
    }
    return countersCache;
  };

  const persistCounters = () => {
    try {
      const userId = getUserId();
      if (!userId || !countersCache) return;
      saveRateLimits(sessionPath, userId, countersCache);
    } catch {
      // Save failure does not affect operation
    }
  };

  const getCounter = (type) => {
    const counters = loadCounters();
    if (!counters[type]) {
      counters[type] = { hourly: 0, daily: 0, hourStart: Date.now(), dayStart: Date.now() };
    }
    const c = counters[type];
    const now = Date.now();
    if (now - c.hourStart > 3600000) { c.hourly = 0; c.hourStart = now; }
    if (now - c.dayStart > 86400000) { c.daily = 0; c.dayStart = now; }
    return c;
  };

  const checkLimit = (type) => {
    const c = getCounter(type);
    const hourlyMax = HOURLY_LIMIT[type];
    const dailyMax = DAILY_LIMIT[type];
    if (hourlyMax && c.hourly >= hourlyMax) {
      const waitMin = Math.ceil((3600000 - (Date.now() - c.hourStart)) / 60000);
      throw new Error(`hourly_limit: ${type} exceeded hourly limit of ${hourlyMax}. Retry in ${waitMin} minutes.`);
    }
    if (dailyMax && c.daily >= dailyMax) {
      throw new Error(`daily_limit: ${type} exceeded daily limit of ${dailyMax}. Try again tomorrow.`);
    }
  };

  const incrementCounter = (type) => {
    const c = getCounter(type);
    c.hourly++;
    c.daily++;
    persistCounters();
  };

  const getCookies = () => {
    if (cachedCookies) return cachedCookies;
    const cookies = loadInstaSession(sessionPath);
    if (!cookies) {
      throw new Error('No session file found. Please log in first.');
    }
    const sessionid = cookies.find((c) => c.name === 'sessionid');
    if (!sessionid?.value) {
      throw new Error('No valid cookies in session. Please log in again.');
    }
    cachedCookies = cookies;
    return cookies;
  };

  const getCsrfToken = () => {
    const cookies = getCookies();
    const csrf = cookies.find((c) => c.name === 'csrftoken');
    return csrf?.value || '';
  };

  const getUserId = () => {
    if (cachedUserId) return cachedUserId;
    const cookies = getCookies();
    const dsUser = cookies.find((c) => c.name === 'ds_user_id');
    cachedUserId = dsUser?.value || null;
    return cachedUserId;
  };

  const request = async (url, options = {}) => {
    const cookies = getCookies();
    const headers = {
      'User-Agent': USER_AGENT,
      'X-IG-App-ID': IG_APP_ID,
      'X-CSRFToken': getCsrfToken(),
      'X-Requested-With': 'XMLHttpRequest',
      Referer: 'https://www.instagram.com/',
      Origin: 'https://www.instagram.com',
      Cookie: cookiesToHeader(cookies),
      ...options.headers,
    };

    const res = await fetch(url, { ...options, headers, redirect: 'manual' });

    if (res.status === 302 || res.status === 301) {
      const location = res.headers.get('location') || '';
      if (location.includes('/accounts/login')) {
        throw new Error('Session expired. Please log in again.');
      }
      if (location.includes('/challenge')) {
        // Attempt automatic challenge resolution
        const resolved = await resolveChallenge();
        if (resolved) {
          // Retry original request after resolution
          return fetch(url, { ...options, headers, redirect: 'manual' });
        }
        throw new Error('challenge_required: Identity verification required. Please complete it manually in the browser.');
      }
      throw new Error(`Redirect occurred: ${res.status} → ${location}`);
    }

    // Handle challenge_required JSON response
    if (res.status === 400 && !options.allowError) {
      const cloned = res.clone();
      try {
        const data = await cloned.json();
        if (data.message === 'challenge_required') {
          const resolved = await resolveChallenge();
          if (resolved) {
            return fetch(url, { ...options, headers, redirect: 'manual' });
          }
          throw new Error('challenge_required: Identity verification required.');
        }
      } catch (e) {
        if (e.message.includes('challenge_required')) throw e;
        // Ignore JSON parse failure and continue original flow
      }
    }

    if (res.status === 401 || res.status === 403) {
      throw new Error(`Authentication error (${res.status}). Please log in again.`);
    }

    if (!res.ok && !options.allowError) {
      throw new Error(`Instagram API error: ${res.status} ${res.statusText}`);
    }

    return res;
  };

  const getProfile = async (username) => {
    const res = await request(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
    );
    const data = await res.json();
    const user = data?.data?.user;
    if (!user) throw new Error(`Profile not found: ${username}`);
    return {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      biography: user.biography,
      followerCount: user.edge_followed_by?.count || 0,
      followingCount: user.edge_follow?.count || 0,
      postCount: user.edge_owner_to_timeline_media?.count || 0,
      isPrivate: user.is_private,
      isVerified: user.is_verified,
      profilePicUrl: user.profile_pic_url_hd || user.profile_pic_url,
      externalUrl: user.external_url,
    };
  };

  const getFeed = async () => {
    const res = await request('https://www.instagram.com/api/v1/feed/timeline/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const data = await res.json();
    const items = data?.feed_items || data?.items || [];
    return items
      .filter((item) => item.media_or_ad || item.media)
      .slice(0, 20)
      .map((item) => {
        const media = item.media_or_ad || item.media;
        return {
          id: media.pk || media.id,
          code: media.code,
          username: media.user?.username,
          caption: media.caption?.text || '',
          likeCount: media.like_count || 0,
          commentCount: media.comment_count || 0,
          mediaType: media.media_type,
          timestamp: media.taken_at,
          url: media.code ? `https://www.instagram.com/p/${media.code}/` : null,
          imageUrl: media.image_versions2?.candidates?.[0]?.url || null,
        };
      });
  };

  const graphqlPost = async (docId, variables) => {
    const body = new URLSearchParams({
      variables: JSON.stringify(variables),
      doc_id: docId,
    });
    const res = await request('https://www.instagram.com/graphql/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    return res.json();
  };

  // doc_id for post detail
  const DOC_ID_POST_DETAIL = '8845758582119845';

  const mapPostItem = (item) => ({
    id: item.pk || item.id,
    code: item.code,
    caption: item.caption?.text || '',
    likeCount: item.like_count || 0,
    commentCount: item.comment_count || 0,
    timestamp: item.taken_at,
    url: item.code ? `https://www.instagram.com/p/${item.code}/` : null,
    imageUrl: item.image_versions2?.candidates?.[0]?.url || item.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url || null,
    isVideo: item.media_type === 2,
  });

  const getUserPosts = async (username, limit = 12) => {
    const profile = await getProfile(username);
    const collected = [];
    let maxId = null;

    while (collected.length < limit) {
      const url = `https://www.instagram.com/api/v1/feed/user/${profile.id}/?count=12` +
        (maxId ? `&max_id=${maxId}` : '');
      const res = await request(url);
      const data = await res.json();
      const items = data?.items || [];
      if (items.length === 0) break;

      collected.push(...items.map(mapPostItem));
      if (!data.more_available || !data.next_max_id) break;
      maxId = data.next_max_id;
    }

    return collected.slice(0, limit);
  };

  const getPostDetail = async (shortcode) => {
    const data = await graphqlPost(DOC_ID_POST_DETAIL, {
      shortcode,
      child_comment_count: 3,
      fetch_comment_count: 40,
      parent_comment_count: 24,
      has_threaded_comments: true,
    });
    const media = data?.data?.xdt_shortcode_media || data?.data?.shortcode_media;
    if (!media) throw new Error(`Post not found: ${shortcode}`);
    return {
      id: media.id,
      code: media.shortcode,
      owner: {
        id: media.owner?.id,
        username: media.owner?.username,
        fullName: media.owner?.full_name,
      },
      caption: media.edge_media_to_caption?.edges?.[0]?.node?.text || '',
      likeCount: media.edge_media_preview_like?.count || 0,
      commentCount: media.edge_media_to_parent_comment?.count || media.edge_media_to_comment?.count || 0,
      timestamp: media.taken_at_timestamp,
      url: `https://www.instagram.com/p/${media.shortcode}/`,
      imageUrl: media.display_url || media.thumbnail_src,
      isVideo: media.is_video,
      videoUrl: media.video_url || null,
      mediaType: media.__typename,
    };
  };

  // ── Automatic Challenge Resolution ──

  const resolveChallenge = async () => {
    try {
      const cookies = getCookies();
      const res = await fetch('https://www.instagram.com/api/v1/challenge/web/action/', {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          'X-IG-App-ID': IG_APP_ID,
          'X-CSRFToken': getCsrfToken(),
          'X-Requested-With': 'XMLHttpRequest',
          'X-Instagram-AJAX': '1',
          Referer: 'https://www.instagram.com/challenge/',
          Origin: 'https://www.instagram.com',
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: cookiesToHeader(cookies),
        },
        body: 'choice=0',
        redirect: 'manual',
      });
      if (!res.ok) return false;
      const data = await res.json();
      return data.status === 'ok';
    } catch {
      return false;
    }
  };

  const parseLikeResponse = async (res) => {
    if (res.ok) return res.json();
    if (res.status === 400) {
      const data = await res.json().catch(() => ({}));
      if (data.spam) {
        throw new Error(`rate_limit: ${data.feedback_title || 'Try Again Later'}`);
      }
      // Already liked/unliked state
      return { status: 'already', message: data.message };
    }
    throw new Error(`Instagram API error: ${res.status}`);
  };

  const withDelay = async (type, fn) => {
    // Check limits
    checkLimit(type);

    // Random delay
    const [min, max] = DELAY[type] || [20, 40];
    const elapsed = (Date.now() - lastActionTime) / 1000;
    if (lastActionTime > 0 && elapsed < min) {
      await randomDelay(min - elapsed, max - elapsed);
    }

    const result = await fn();
    lastActionTime = Date.now();
    incrementCounter(type);
    return result;
  };

  const likePost = (mediaId) => withDelay('like', async () => {
    const res = await request(
      `https://www.instagram.com/api/v1/web/likes/${mediaId}/like/`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Instagram-AJAX': '1',
        },
        body: '',
        allowError: true,
      },
    );
    return parseLikeResponse(res);
  });

  const unlikePost = (mediaId) => withDelay('like', async () => {
    const res = await request(
      `https://www.instagram.com/api/v1/web/likes/${mediaId}/unlike/`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Instagram-AJAX': '1',
        },
        body: '',
        allowError: true,
      },
    );
    return parseLikeResponse(res);
  });

  const likeComment = (commentId) => withDelay('like', async () => {
    const res = await request(
      `https://www.instagram.com/api/v1/web/comments/like/${commentId}/`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Instagram-AJAX': '1',
        },
        body: '',
        allowError: true,
      },
    );
    return parseLikeResponse(res);
  });

  const unlikeComment = (commentId) => withDelay('like', async () => {
    const res = await request(
      `https://www.instagram.com/api/v1/web/comments/unlike/${commentId}/`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Instagram-AJAX': '1',
        },
        body: '',
        allowError: true,
      },
    );
    return parseLikeResponse(res);
  });

  const followUser = (userId) => withDelay('follow', async () => {
    const res = await request(
      `https://www.instagram.com/api/v1/friendships/create/${userId}/`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Instagram-AJAX': '1',
        },
        body: '',
        allowError: true,
      },
    );
    const data = await res.json();
    return {
      status: data.status || (data.friendship_status ? 'ok' : 'fail'),
      following: data.friendship_status?.following || false,
      outgoingRequest: data.friendship_status?.outgoing_request || false,
    };
  });

  const unfollowUser = (userId) => withDelay('unfollow', async () => {
    const res = await request(
      `https://www.instagram.com/api/v1/friendships/destroy/${userId}/`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Instagram-AJAX': '1',
        },
        body: '',
        allowError: true,
      },
    );
    const data = await res.json();
    return {
      status: data.status || (data.friendship_status ? 'ok' : 'fail'),
      following: data.friendship_status?.following || false,
    };
  });

  const getComments = async (shortcode) => {
    const data = await graphqlPost(DOC_ID_POST_DETAIL, {
      shortcode,
      child_comment_count: 0,
      fetch_comment_count: 40,
      parent_comment_count: 40,
      has_threaded_comments: true,
    });
    const media = data?.data?.xdt_shortcode_media || data?.data?.shortcode_media;
    const edges = media?.edge_media_to_parent_comment?.edges || media?.edge_media_to_comment?.edges || [];
    return edges.map((e) => ({
      id: e.node?.id,
      text: e.node?.text || '',
      username: e.node?.owner?.username || '',
      userId: e.node?.owner?.id || '',
      timestamp: e.node?.created_at,
    }));
  };

  const hasMyComment = async (shortcode) => {
    const myUserId = getUserId();
    const comments = await getComments(shortcode);
    return comments.some((c) => c.userId === myUserId);
  };

  const addComment = (mediaId, text) => withDelay('comment', async () => {
    const body = new URLSearchParams({ comment_text: text });
    const res = await request(
      `https://www.instagram.com/api/v1/web/comments/${mediaId}/add/`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      },
    );
    return res.json();
  });

  const getMediaIdFromShortcode = async (shortcode) => {
    const detail = await getPostDetail(shortcode);
    return detail.id;
  };

  const uploadPhoto = async (imageBuffer) => {
    const uploadId = Date.now().toString();
    const uploadName = `${uploadId}_0_${Math.floor(Math.random() * 9000000000 + 1000000000)}`;

    const res = await request(
      `https://www.instagram.com/rupload_igphoto/${uploadName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'image/jpeg',
          'X-Entity-Name': uploadName,
          'X-Entity-Length': imageBuffer.length.toString(),
          'X-Instagram-Rupload-Params': JSON.stringify({
            media_type: 1,
            upload_id: uploadId,
            upload_media_height: 1080,
            upload_media_width: 1080,
          }),
          Offset: '0',
        },
        body: imageBuffer,
      },
    );
    const data = await res.json();
    if (data.status !== 'ok') {
      throw new Error(`Image upload failed: ${data.message || 'unknown'}`);
    }
    return uploadId;
  };

  const configurePost = (uploadId, caption = '') => withDelay('publish', async () => {
    const body = new URLSearchParams({
      source_type: 'library',
      caption,
      upload_id: uploadId,
      disable_comments: '0',
      like_and_view_counts_disabled: '0',
      igtv_share_preview_to_feed: '1',
      is_unified_video: '1',
      video_subtitles_enabled: '0',
    });
    const res = await request('https://www.instagram.com/api/v1/media/configure/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: 'https://www.instagram.com/create/details/',
      },
      body: body.toString(),
    });
    const data = await res.json();
    if (data.status !== 'ok') {
      throw new Error(`Post creation failed: ${data.message || 'unknown'}`);
    }
    return {
      id: data.media?.pk,
      code: data.media?.code,
      url: data.media?.code ? `https://www.instagram.com/p/${data.media.code}/` : null,
      caption: data.media?.caption?.text || caption,
    };
  });

  const publishPost = async ({ imageUrl, imagePath, caption = '' }) => {
    let imageBuffer;
    if (imagePath) {
      imageBuffer = fs.readFileSync(imagePath);
    } else if (imageUrl) {
      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error(`Image download failed: ${res.status}`);
      imageBuffer = Buffer.from(await res.arrayBuffer());
    } else {
      throw new Error('Either imageUrl or imagePath is required.');
    }

    const uploadId = await uploadPhoto(imageBuffer);
    return configurePost(uploadId, caption);
  };

  const deletePost = async (mediaId) => {
    const res = await request(
      `https://www.instagram.com/api/v1/media/${mediaId}/delete/?media_type=PHOTO`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    );
    return res.json();
  };

  const resetState = () => {
    cachedCookies = null;
    cachedUserId = null;
    countersCache = null;
  };

  return {
    getCookies,
    getCsrfToken,
    getUserId,
    request,
    getProfile,
    getFeed,
    getUserPosts,
    getPostDetail,
    likePost,
    unlikePost,
    likeComment,
    unlikeComment,
    followUser,
    unfollowUser,
    getComments,
    hasMyComment,
    addComment,
    getMediaIdFromShortcode,
    uploadPhoto,
    configurePost,
    publishPost,
    deletePost,
    resolveChallenge,
    resetState,
    getRateLimitStatus: () => {
      const status = {};
      for (const type of Object.keys(HOURLY_LIMIT)) {
        const c = getCounter(type);
        status[type] = {
          hourly: `${c.hourly}/${HOURLY_LIMIT[type]}`,
          daily: `${c.daily}/${DAILY_LIMIT[type]}`,
          delay: `${DELAY[type]?.[0]}~${DELAY[type]?.[1]}s`,
        };
      }
      return status;
    },
  };
};

module.exports = createInstaApiClient;
