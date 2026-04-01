const fs = require('fs');
const { loadThreadsSession, loadRateLimits, saveRateLimits } = require('./session');
const { THREADS_APP_ID, THREADS_USER_AGENT, BLOKS_VERSION, BASE_URL } = require('./auth');

const randomDelay = (minSec, maxSec) => {
  const ms = (minSec + Math.random() * (maxSec - minSec)) * 1000;
  return new Promise((resolve) => setTimeout(resolve, ms));
};

// ──────────────────────────────────────────────────────────────
// Threads Safe Action Rules (conservative, Instagram-based)
// ──────────────────────────────────────────────────────────────

const DELAY = {
  publish:  [120, 300],  // 2~5min
  like:     [15, 20],    // 15~20s
  comment:  [120, 300],  // 2~5min
  follow:   [30, 30],    // 30s
  unfollow: [60, 120],   // 1~2min
};

const HOURLY_LIMIT = {
  publish: 10,
  like: 15,
  comment: 5,
  follow: 15,
  unfollow: 10,
};

const DAILY_LIMIT = {
  publish: 50,
  like: 500,
  comment: 100,
  follow: 250,
  unfollow: 200,
};

let lastActionTime = 0;

const createThreadsApiClient = ({ sessionPath }) => {
  let cachedSession = null;
  let countersCache = null;

  // ── Session helpers ──

  const getSession = () => {
    if (cachedSession) return cachedSession;
    const session = loadThreadsSession(sessionPath);
    if (!session) {
      throw new Error('No session file found. Please log in first.');
    }
    if (!session.token) {
      throw new Error('No valid token in session. Please log in again.');
    }
    cachedSession = session;
    return session;
  };

  const getToken = () => getSession().token;
  const getUserIdFromSession = () => getSession().userId;
  const getDeviceId = () => getSession().deviceId;

  // ── Rate Limit counters ──

  const loadCounters = () => {
    if (countersCache) return countersCache;
    try {
      const userId = getUserIdFromSession();
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
      const userId = getUserIdFromSession();
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

  const withDelay = async (type, fn) => {
    checkLimit(type);

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

  // ── HTTP request helper ──

  const getHeaders = () => ({
    'User-Agent': `${THREADS_USER_AGENT} (30/11; 420dpi; 1080x2400; samsung; SM-A325F; a32; exynos850)`,
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'Authorization': `Bearer IGT:2:${getToken()}`,
    'X-IG-App-ID': THREADS_APP_ID,
    'X-Bloks-Version-Id': BLOKS_VERSION,
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
  });

  const request = async (url, options = {}) => {
    const headers = { ...getHeaders(), ...options.headers };

    const res = await fetch(url, {
      ...options,
      headers,
      redirect: options.followRedirect ? 'follow' : 'manual',
    });

    if (res.status === 302 || res.status === 301) {
      const location = res.headers.get('location') || '';
      if (location.includes('/accounts/login') || location.includes('login')) {
        throw new Error('Session expired. Please log in again.');
      }
      throw new Error(`Redirect occurred: ${res.status} -> ${location}`);
    }

    if (res.status === 401 || res.status === 403) {
      throw new Error(`Authentication error (${res.status}). Please log in again.`);
    }

    if (!res.ok && !options.allowError) {
      throw new Error(`Threads API error: ${res.status} ${res.statusText}`);
    }

    return res;
  };

  // ── API methods ──

  const getUserId = async (username) => {
    const res = await request(
      `${BASE_URL}/api/v1/users/search/?q=${encodeURIComponent(username)}`,
    );
    const data = await res.json();
    const user = data?.users?.find(
      (u) => u.username?.toLowerCase() === username.toLowerCase(),
    );
    if (!user) throw new Error(`User not found: ${username}`);
    return user.pk_id || user.pk || String(user.pk);
  };

  const getUserProfile = async (userId) => {
    const res = await request(`${BASE_URL}/api/v1/users/${userId}/info/`);
    const data = await res.json();
    const user = data?.user;
    if (!user) throw new Error(`Profile not found for userId: ${userId}`);
    return {
      id: user.pk || userId,
      username: user.username,
      fullName: user.full_name,
      biography: user.biography,
      followerCount: user.follower_count || 0,
      followingCount: user.following_count || 0,
      isPrivate: user.is_private,
      isVerified: user.is_verified,
      profilePicUrl: user.hd_profile_pic_url_info?.url || user.profile_pic_url,
    };
  };

  const getTimeline = async () => {
    const res = await request(`${BASE_URL}/api/v1/feed/text_post_app_timeline/`, {
      method: 'POST',
      body: '',
    });
    const data = await res.json();
    const items = data?.items || [];
    return items
      .filter((item) => item.post || item.thread_items)
      .slice(0, 20)
      .map((item) => {
        const threadItems = item.thread_items || [item];
        const first = threadItems[0]?.post || threadItems[0];
        return {
          id: first?.pk || first?.id,
          code: first?.code,
          username: first?.user?.username,
          caption: first?.caption?.text || '',
          likeCount: first?.like_count || 0,
          replyCount: first?.text_post_app_info?.direct_reply_count || 0,
          timestamp: first?.taken_at,
        };
      });
  };

  const getUserThreads = async (userId, limit = 20) => {
    const res = await request(`${BASE_URL}/api/v1/text_feed/${userId}/profile/`);
    const data = await res.json();
    const threads = data?.threads || [];
    return threads.slice(0, limit).map((thread) => {
      const items = thread.thread_items || [];
      const first = items[0]?.post;
      return {
        id: first?.pk || first?.id,
        code: first?.code,
        caption: first?.caption?.text || '',
        likeCount: first?.like_count || 0,
        replyCount: first?.text_post_app_info?.direct_reply_count || 0,
        timestamp: first?.taken_at,
      };
    });
  };

  const getThreadReplies = async (postId) => {
    const res = await request(`${BASE_URL}/api/v1/text_feed/${postId}/replies/`);
    const data = await res.json();
    const items = data?.thread_items || [];
    return items.map((item) => {
      const post = item.post;
      return {
        id: post?.pk || post?.id,
        username: post?.user?.username,
        text: post?.caption?.text || '',
        likeCount: post?.like_count || 0,
        timestamp: post?.taken_at,
      };
    });
  };

  const publishTextThread = (text, replyToId) => withDelay('publish', async () => {
    const userId = getUserIdFromSession();
    const uploadId = Date.now().toString();
    const deviceId = getDeviceId();

    const payload = {
      publish_mode: 'text_post',
      text_post_app_info: JSON.stringify({ reply_control: 0 }),
      timezone_offset: '32400',
      source_type: '4',
      caption: text,
      upload_id: uploadId,
      device_id: deviceId,
      _uid: userId,
    };

    if (replyToId) {
      payload.text_post_app_info = JSON.stringify({
        reply_control: 0,
        reply_id: replyToId,
      });
    }

    const body = `signed_body=SIGNATURE.${encodeURIComponent(JSON.stringify(payload))}`;

    const res = await request(`${BASE_URL}/api/v1/media/configure_text_only_post/`, {
      method: 'POST',
      body,
    });

    const data = await res.json();
    if (data.status !== 'ok') {
      throw new Error(`Thread publish failed: ${data.message || JSON.stringify(data)}`);
    }

    return {
      id: data.media?.pk || data.media?.id,
      code: data.media?.code,
      caption: data.media?.caption?.text || text,
      status: data.status,
    };
  });

  const uploadImage = async (imageBuffer) => {
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
        followRedirect: true,
      },
    );
    const data = await res.json();
    if (data.status !== 'ok') {
      throw new Error(`Image upload failed: ${data.message || 'unknown'}`);
    }
    return uploadId;
  };

  const publishImageThread = (uploadId, text) => withDelay('publish', async () => {
    const userId = getUserIdFromSession();
    const deviceId = getDeviceId();

    const payload = {
      publish_mode: 'text_post',
      text_post_app_info: JSON.stringify({ reply_control: 0 }),
      timezone_offset: '32400',
      source_type: '4',
      caption: text || '',
      device_id: deviceId,
      _uid: userId,
      client_sidecar_id: uploadId,
      children_metadata: [{
        upload_id: uploadId,
        source_type: '4',
        timezone_offset: '32400',
        scene_capture_type: '',
      }],
    };

    const body = `signed_body=SIGNATURE.${encodeURIComponent(JSON.stringify(payload))}`;

    const res = await request(`${BASE_URL}/api/v1/media/configure_text_post_app_sidecar/`, {
      method: 'POST',
      body,
      allowError: true,
    });

    const data = await res.json();
    if (data.status !== 'ok') {
      throw new Error(`Image thread publish failed: ${data.message || JSON.stringify(data)}`);
    }

    return {
      id: data.media?.pk || data.media?.id,
      code: data.media?.code,
      caption: data.media?.caption?.text || text,
      permalink: data.media?.permalink,
      status: data.status,
    };
  });

  const likeThread = (postId) => withDelay('like', async () => {
    const userId = getUserIdFromSession();
    const res = await request(
      `${BASE_URL}/api/v1/media/${postId}_${userId}/like/`,
      { method: 'POST', body: '', allowError: true },
    );
    const data = await res.json();
    return { status: data.status || 'ok' };
  });

  const unlikeThread = (postId) => withDelay('like', async () => {
    const userId = getUserIdFromSession();
    const res = await request(
      `${BASE_URL}/api/v1/media/${postId}_${userId}/unlike/`,
      { method: 'POST', body: '', allowError: true },
    );
    const data = await res.json();
    return { status: data.status || 'ok' };
  });

  const followUser = (userId) => withDelay('follow', async () => {
    const res = await request(
      `${BASE_URL}/api/v1/friendships/create/${userId}/`,
      { method: 'POST', body: '', allowError: true },
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
      `${BASE_URL}/api/v1/friendships/destroy/${userId}/`,
      { method: 'POST', body: '', allowError: true },
    );
    const data = await res.json();
    return {
      status: data.status || (data.friendship_status ? 'ok' : 'fail'),
      following: data.friendship_status?.following || false,
    };
  });

  const searchUsers = async (query, limit = 20) => {
    const res = await request(
      `${BASE_URL}/api/v1/users/search/?q=${encodeURIComponent(query)}`,
    );
    const data = await res.json();
    const users = data?.users || [];
    return users.slice(0, limit).map((u) => ({
      id: u.pk || u.pk_id,
      username: u.username,
      fullName: u.full_name,
      isVerified: u.is_verified,
      profilePicUrl: u.profile_pic_url,
    }));
  };

  const deleteThread = async (postId) => {
    const res = await request(
      `${BASE_URL}/api/v1/media/${postId}/delete/?media_type=TEXT_POST`,
      { method: 'POST' },
    );
    return res.json();
  };

  const resetState = () => {
    cachedSession = null;
    countersCache = null;
  };

  return {
    getSession,
    getToken,
    getUserIdFromSession,
    request,
    getUserId,
    getUserProfile,
    getTimeline,
    getUserThreads,
    getThreadReplies,
    publishTextThread,
    uploadImage,
    publishImageThread,
    likeThread,
    unlikeThread,
    followUser,
    unfollowUser,
    searchUsers,
    deleteThread,
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

module.exports = createThreadsApiClient;
