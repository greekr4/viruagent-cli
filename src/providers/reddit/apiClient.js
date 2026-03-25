const { loadRedditSession, isTokenExpired, cookiesToHeader, loadRateLimits, saveRateLimits } = require('./session');
const { buildUserAgent } = require('./auth');
const { parseRedditError } = require('./utils');

const randomDelay = (minSec, maxSec) => {
  const ms = (minSec + Math.random() * (maxSec - minSec)) * 1000;
  return new Promise((resolve) => setTimeout(resolve, ms));
};

// ──────────────────────────────────────────────────────────────
// Reddit Safe Action Rules
//
// [Minimum action intervals + random jitter]
//   Post:      600~900s (10~15min)
//   Comment:   120~300s (2~5min)
//   Vote:       10~30s
//   Subscribe:  30~60s
//
// [Hourly / Daily limits (conservative)]
//   Post:      2/h,   10/day
//   Comment:   6/h,   50/day
//   Vote:     30/h,  500/day
//   Subscribe: 10/h,  100/day
// ──────────────────────────────────────────────────────────────

const DELAY = {
  post:      [600, 900],   // 10~15min
  comment:   [120, 300],   // 2~5min
  vote:      [10, 30],     // 10~30s
  subscribe: [30, 60],     // 30~60s
};

const HOURLY_LIMIT = {
  post: 2,
  comment: 6,
  vote: 30,
  subscribe: 10,
};

const DAILY_LIMIT = {
  post: 10,
  comment: 50,
  vote: 500,
  subscribe: 100,
};

let lastActionTime = 0;

const createRedditApiClient = ({ sessionPath }) => {
  let cachedSession = null;
  let countersCache = null;

  // ── Session helpers ──

  const getSession = () => {
    if (cachedSession && !isTokenExpired(sessionPath)) return cachedSession;
    const session = loadRedditSession(sessionPath);
    if (!session) {
      throw new Error('No session file found. Please log in first.');
    }
    if (session.authMode === 'browser') {
      if (!session.cookies || session.cookies.length === 0) {
        throw new Error('No valid cookies in session. Please log in again.');
      }
    } else if (session.authMode === 'cookie') {
      if (!session.redditSession) {
        throw new Error('No valid cookie in session. Please log in again.');
      }
    } else {
      if (!session.accessToken) {
        throw new Error('No valid token in session. Please log in again.');
      }
      if (isTokenExpired(sessionPath)) {
        throw new Error('Token expired. Please log in again.');
      }
    }
    cachedSession = session;
    return session;
  };

  const getUserAgent = () => {
    const session = getSession();
    return buildUserAgent(session.username);
  };

  // ── Rate limit counters ──

  const loadCounters = () => {
    if (countersCache) return countersCache;
    try {
      const saved = loadRateLimits(sessionPath);
      countersCache = saved || {};
    } catch {
      countersCache = {};
    }
    return countersCache;
  };

  const persistCounters = () => {
    try {
      if (!countersCache) return;
      saveRateLimits(sessionPath, countersCache);
    } catch {
      // silent
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
    const [min, max] = DELAY[type] || [10, 20];
    const elapsed = (Date.now() - lastActionTime) / 1000;
    if (lastActionTime > 0 && elapsed < min) {
      await randomDelay(min - elapsed, max - elapsed);
    }
    const result = await fn();
    lastActionTime = Date.now();
    incrementCounter(type);
    return result;
  };

  // ── Core request layer ──

  const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

  const request = async (urlPath, options = {}) => {
    const session = getSession();

    let url, headers;

    if (session.authMode === 'browser') {
      // Browser-based: use token_v2 as Bearer token with oauth.reddit.com
      const tokenV2 = session.cookies.find((c) => c.name === 'token_v2');
      if (tokenV2) {
        const baseUrl = 'https://oauth.reddit.com';
        url = urlPath.startsWith('http') ? urlPath : `${baseUrl}${urlPath}`;
        headers = {
          'User-Agent': BROWSER_UA,
          Authorization: `Bearer ${tokenV2.value}`,
          ...options.headers,
        };
      } else {
        // Fallback: use cookies directly with www.reddit.com
        const baseUrl = 'https://www.reddit.com';
        url = urlPath.startsWith('http') ? urlPath : `${baseUrl}${urlPath}`;
        headers = {
          'User-Agent': BROWSER_UA,
          Cookie: cookiesToHeader(session.cookies),
          ...options.headers,
        };
      }
    } else if (session.authMode === 'cookie') {
      // Cookie-based: use old.reddit.com
      const baseUrl = 'https://old.reddit.com';
      url = urlPath.startsWith('http') ? urlPath : `${baseUrl}${urlPath}`;
      headers = {
        'User-Agent': BROWSER_UA,
        Cookie: `reddit_session=${session.redditSession}`,
        ...options.headers,
      };
      // Inject modhash for POST requests
      if (options.method === 'POST' && session.modhash && options.body) {
        const bodyStr = String(options.body);
        if (!bodyStr.includes('uh=')) {
          options.body = bodyStr + `&uh=${session.modhash}`;
        }
      }
    } else {
      // OAuth-based: use oauth.reddit.com
      const baseUrl = 'https://oauth.reddit.com';
      url = urlPath.startsWith('http') ? urlPath : `${baseUrl}${urlPath}`;
      headers = {
        'User-Agent': getUserAgent(),
        Authorization: `Bearer ${session.accessToken}`,
        ...options.headers,
      };
    }

    const res = await fetch(url, { ...options, headers });

    if (res.status === 401 || res.status === 403) {
      throw new Error(`Authentication error (${res.status}). Session expired.`);
    }

    if (res.status === 429) {
      throw new Error('rate_limit: Reddit API rate limit exceeded. Please wait and try again.');
    }

    if (!res.ok && !options.allowError) {
      throw new Error(`Reddit API error: ${res.status} ${res.statusText}`);
    }

    return res;
  };

  const requestJson = async (urlPath, options = {}) => {
    const res = await request(urlPath, options);
    return res.json();
  };

  // ── API Methods ──

  const getMe = async () => {
    const session = getSession();
    if (session.authMode === 'browser') {
      // Browser mode: token_v2 works with oauth.reddit.com
      const data = await requestJson('/api/v1/me');
      const d = data.data || data;
      return {
        id: d.id,
        username: d.name || session.username,
        commentKarma: d.comment_karma,
        linkKarma: d.link_karma,
        totalKarma: d.total_karma || (d.comment_karma || 0) + (d.link_karma || 0),
        createdAt: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null,
        isVerified: d.has_verified_email || d.verified,
        hasMail: d.has_mail,
      };
    }
    if (session.authMode === 'cookie') {
      const data = await requestJson('/api/me.json');
      const d = data.data || data;
      return {
        id: d.id,
        username: d.name,
        commentKarma: d.comment_karma,
        linkKarma: d.link_karma,
        totalKarma: (d.comment_karma || 0) + (d.link_karma || 0),
        createdAt: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null,
        isVerified: d.has_verified_email,
        hasMail: d.has_mail,
      };
    }
    const data = await requestJson('/api/v1/me');
    return {
      id: data.id,
      username: data.name,
      commentKarma: data.comment_karma,
      linkKarma: data.link_karma,
      totalKarma: data.total_karma,
      createdAt: data.created_utc ? new Date(data.created_utc * 1000).toISOString() : null,
      iconUrl: data.icon_img,
      isVerified: data.verified,
      hasMail: data.has_mail,
    };
  };

  const submitPost = ({ subreddit, title, text, kind = 'self', url: linkUrl, flair } = {}) =>
    withDelay('post', async () => {
      if (!subreddit || !title) throw new Error('subreddit and title are required.');

      const body = new URLSearchParams({
        api_type: 'json',
        kind,
        sr: subreddit,
        title,
        resubmit: 'true',
      });

      if (kind === 'self' && text) body.append('text', text);
      if (kind === 'link' && linkUrl) body.append('url', linkUrl);
      if (flair) body.append('flair_text', flair);

      const data = await requestJson('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      const err = parseRedditError(data);
      if (err) throw new Error(`submitPost failed: ${err.error} - ${err.message}`);

      const postData = data.json?.data;
      return {
        id: postData?.id,
        fullname: postData?.name,
        url: postData?.url,
        title,
        subreddit,
      };
    });

  const getSubreddit = async ({ name } = {}) => {
    if (!name) throw new Error('subreddit name is required.');
    const data = await requestJson(`/r/${name}/about`);
    const d = data.data || data;
    return {
      name: d.display_name,
      title: d.title,
      description: d.public_description,
      subscribers: d.subscribers,
      activeUsers: d.accounts_active,
      createdAt: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null,
      isNsfw: d.over18,
      url: `https://www.reddit.com/r/${d.display_name}/`,
    };
  };

  const getSubredditPosts = async ({ subreddit, sort = 'hot', limit = 25 } = {}) => {
    if (!subreddit) throw new Error('subreddit is required.');
    const params = new URLSearchParams({ limit: String(limit) });
    const data = await requestJson(`/r/${subreddit}/${sort}?${params}`);
    const posts = (data.data?.children || []).map((child) => {
      const p = child.data;
      return {
        id: p.id,
        fullname: p.name,
        title: p.title,
        author: p.author,
        subreddit: p.subreddit,
        score: p.score,
        upvoteRatio: p.upvote_ratio,
        numComments: p.num_comments,
        url: p.url,
        permalink: `https://www.reddit.com${p.permalink}`,
        selftext: p.selftext?.substring(0, 500),
        createdAt: p.created_utc ? new Date(p.created_utc * 1000).toISOString() : null,
        isNsfw: p.over_18,
        flair: p.link_flair_text,
      };
    });
    return posts;
  };

  const getPost = async ({ postId } = {}) => {
    if (!postId) throw new Error('postId is required.');
    const cleanId = String(postId).replace(/^t3_/, '');
    const data = await requestJson(`/comments/${cleanId}`);
    const postListing = Array.isArray(data) ? data[0] : data;
    const p = postListing?.data?.children?.[0]?.data;
    if (!p) throw new Error(`Post not found: ${postId}`);

    const commentListing = Array.isArray(data) ? data[1] : null;
    const comments = (commentListing?.data?.children || [])
      .filter((c) => c.kind === 't1')
      .map((c) => ({
        id: c.data.id,
        fullname: c.data.name,
        author: c.data.author,
        body: c.data.body?.substring(0, 500),
        score: c.data.score,
        createdAt: c.data.created_utc ? new Date(c.data.created_utc * 1000).toISOString() : null,
      }));

    return {
      id: p.id,
      fullname: p.name,
      title: p.title,
      author: p.author,
      subreddit: p.subreddit,
      selftext: p.selftext,
      score: p.score,
      upvoteRatio: p.upvote_ratio,
      numComments: p.num_comments,
      url: p.url,
      permalink: `https://www.reddit.com${p.permalink}`,
      createdAt: p.created_utc ? new Date(p.created_utc * 1000).toISOString() : null,
      flair: p.link_flair_text,
      comments,
    };
  };

  const comment = ({ parentFullname, text } = {}) =>
    withDelay('comment', async () => {
      if (!parentFullname || !text) throw new Error('parentFullname and text are required.');

      const body = new URLSearchParams({
        api_type: 'json',
        thing_id: parentFullname,
        text,
      });

      const data = await requestJson('/api/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      const err = parseRedditError(data);
      if (err) throw new Error(`comment failed: ${err.error} - ${err.message}`);

      const commentData = data.json?.data?.things?.[0]?.data;
      return {
        id: commentData?.id,
        fullname: commentData?.name,
        body: text,
        parentFullname,
      };
    });

  const vote = ({ fullname, direction = 1 } = {}) =>
    withDelay('vote', async () => {
      if (!fullname) throw new Error('fullname is required.');

      const body = new URLSearchParams({
        id: fullname,
        dir: String(direction),
      });

      await request('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      return { status: 'ok', fullname, direction };
    });

  const search = async ({ query, subreddit, limit = 25 } = {}) => {
    if (!query) throw new Error('query is required.');
    const params = new URLSearchParams({
      q: query,
      limit: String(limit),
      sort: 'relevance',
      type: 'link',
    });
    if (subreddit) params.set('restrict_sr', 'true');
    const endpoint = subreddit ? `/r/${subreddit}/search` : '/search';
    const data = await requestJson(`${endpoint}?${params}`);
    return (data.data?.children || []).map((child) => {
      const p = child.data;
      return {
        id: p.id,
        fullname: p.name,
        title: p.title,
        author: p.author,
        subreddit: p.subreddit,
        score: p.score,
        numComments: p.num_comments,
        url: p.url,
        permalink: `https://www.reddit.com${p.permalink}`,
        selftext: p.selftext?.substring(0, 300),
        createdAt: p.created_utc ? new Date(p.created_utc * 1000).toISOString() : null,
      };
    });
  };

  const subscribe = ({ subreddit } = {}) =>
    withDelay('subscribe', async () => {
      if (!subreddit) throw new Error('subreddit is required.');

      const body = new URLSearchParams({
        action: 'sub',
        sr_name: subreddit,
      });

      await request('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      return { status: 'ok', subreddit, subscribed: true };
    });

  const unsubscribe = ({ subreddit } = {}) =>
    withDelay('subscribe', async () => {
      if (!subreddit) throw new Error('subreddit is required.');

      const body = new URLSearchParams({
        action: 'unsub',
        sr_name: subreddit,
      });

      await request('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      return { status: 'ok', subreddit, subscribed: false };
    });

  const getUserPosts = async ({ username, limit = 25 } = {}) => {
    if (!username) throw new Error('username is required.');
    const params = new URLSearchParams({
      limit: String(limit),
      sort: 'new',
      type: 'links',
    });
    const data = await requestJson(`/user/${username}/submitted?${params}`);
    return (data.data?.children || []).map((child) => {
      const p = child.data;
      return {
        id: p.id,
        fullname: p.name,
        title: p.title,
        subreddit: p.subreddit,
        score: p.score,
        numComments: p.num_comments,
        url: p.url,
        permalink: `https://www.reddit.com${p.permalink}`,
        createdAt: p.created_utc ? new Date(p.created_utc * 1000).toISOString() : null,
      };
    });
  };

  const deletePost = async ({ fullname } = {}) => {
    if (!fullname) throw new Error('fullname is required.');

    const body = new URLSearchParams({ id: fullname });

    await request('/api/del', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    return { status: 'ok', fullname };
  };

  const refreshToken = async ({ clientId, clientSecret, username, password } = {}) => {
    const { createLogin } = require('./auth');
    const login = createLogin({ sessionPath });
    return login({ clientId, clientSecret, username, password });
  };

  const resetState = () => {
    cachedSession = null;
    countersCache = null;
  };

  return {
    getMe,
    submitPost,
    getSubreddit,
    getSubredditPosts,
    getPost,
    comment,
    vote,
    search,
    subscribe,
    unsubscribe,
    getUserPosts,
    deletePost,
    refreshToken,
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

module.exports = createRedditApiClient;
