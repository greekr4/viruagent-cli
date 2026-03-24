const fs = require('fs');
const { loadXSession, cookiesToHeader, loadRateLimits, saveRateLimits } = require('./session');
const { USER_AGENT, BEARER_TOKEN } = require('./auth');
const { getOperation, invalidateCache } = require('./graphqlSync');

const randomDelay = (minSec, maxSec) => {
  const ms = (minSec + Math.random() * (maxSec - minSec)) * 1000;
  return new Promise((resolve) => setTimeout(resolve, ms));
};

// ──────────────────────────────────────────────────────────────
// X (Twitter) Safe Action Rules (2026, community research)
//
// Account age matters significantly:
//   New (0~30 days): use limits below (conservative)
//   Mature (90+ days): can roughly double these
//
// [Minimum action intervals + random jitter ±30%]
//   Tweet:    120~300s (2~5min)
//   Like:      30~60s
//   Retweet:   60~120s
//   Follow:   120~180s
//   Unfollow: 120~180s
//
// [Hourly / Daily limits (new account safe zone)]
//   Tweet:    10/h,  50/day  (hard cap 2,400/day including replies)
//   Like:     15/h, 200/day  (hard cap ~500-1,000)
//   Retweet:  10/h,  50/day  (counts toward tweet cap)
//   Follow:   10/h, 100/day  (hard cap 400/day)
//   Unfollow:  8/h,  80/day
//
// [226 error triggers]
//   - Burst patterns / fixed intervals
//   - Repetitive content
//   - Write-only (no read behavior)
//   - New account + high volume
//   - Cooldown: 12~48h after 226, don't resume immediately
// ──────────────────────────────────────────────────────────────

const DELAY = {
  tweet:    [120, 300],   // 2~5min
  like:     [30, 60],     // 30~60s
  retweet:  [60, 120],    // 1~2min
  follow:   [120, 180],   // 2~3min
  unfollow: [120, 180],   // 2~3min
};

const HOURLY_LIMIT = {
  tweet: 10,
  like: 15,
  retweet: 10,
  follow: 10,
  unfollow: 8,
};

const DAILY_LIMIT = {
  tweet: 50,
  like: 200,
  retweet: 50,
  follow: 100,
  unfollow: 80,
};

let lastActionTime = 0;

const createXApiClient = ({ sessionPath }) => {
  let cachedCookies = null;
  let countersCache = null;

  // ── Cookie helpers ──

  const getCookies = () => {
    if (cachedCookies) return cachedCookies;
    const cookies = loadXSession(sessionPath);
    if (!cookies) {
      throw new Error('No session file found. Please log in first.');
    }
    const authToken = cookies.find((c) => c.name === 'auth_token');
    if (!authToken?.value) {
      throw new Error('No valid cookies in session. Please log in again.');
    }
    cachedCookies = cookies;
    return cookies;
  };

  const getCt0 = () => {
    const cookies = getCookies();
    const ct0 = cookies.find((c) => c.name === 'ct0');
    return ct0?.value || '';
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

  const buildHeaders = () => ({
    'User-Agent': USER_AGENT,
    Authorization: `Bearer ${BEARER_TOKEN}`,
    'x-csrf-token': getCt0(),
    'x-twitter-auth-type': 'OAuth2Session',
    'x-twitter-active-user': 'yes',
    'x-twitter-client-language': 'ko',
    Cookie: cookiesToHeader(getCookies()),
  });

  const request = async (url, options = {}) => {
    const headers = { ...buildHeaders(), ...options.headers };
    const res = await fetch(url, { ...options, headers, redirect: 'manual' });

    if (res.status === 401 || res.status === 403) {
      throw new Error(`Authentication error (${res.status}). Session expired.`);
    }

    if (res.status === 429) {
      throw new Error('rate_limit: X API rate limit exceeded. Please wait and try again.');
    }

    if (!res.ok && !options.allowError) {
      throw new Error(`X API error: ${res.status} ${res.statusText}`);
    }

    return res;
  };

  // ── GraphQL helpers ──

  const buildFeatures = (featureSwitches) => {
    const features = {};
    for (const f of featureSwitches) features[f] = true;
    return features;
  };

  const buildFieldToggles = (fieldToggles) => {
    const toggles = {};
    for (const f of fieldToggles) toggles[f] = true;
    return toggles;
  };

  const graphqlQuery = async (operationName, variables = {}) => {
    const op = await getOperation(operationName);
    const features = buildFeatures(op.featureSwitches);
    const fieldToggles = buildFieldToggles(op.fieldToggles);

    const params = new URLSearchParams({
      variables: JSON.stringify(variables),
      features: JSON.stringify(features),
      fieldToggles: JSON.stringify(fieldToggles),
    });

    const url = `https://x.com/i/api/graphql/${op.queryId}/${operationName}?${params}`;

    // Use POST if URL is too long (>2000 chars) to avoid 404
    let res;
    if (url.length > 2000) {
      res = await request(`https://x.com/i/api/graphql/${op.queryId}/${operationName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variables, features, fieldToggles, queryId: op.queryId }),
      });
    } else {
      res = await request(url);
    }

    const data = await res.json();

    // If we get errors indicating stale queryId, re-sync and retry once
    if (data.errors?.some((e) => e.message?.includes('Could not resolve'))) {
      invalidateCache();
      const retryOp = await getOperation(operationName);
      const retryFeatures = buildFeatures(retryOp.featureSwitches);
      const retryFieldToggles = buildFieldToggles(retryOp.fieldToggles);
      const retryRes = await request(`https://x.com/i/api/graphql/${retryOp.queryId}/${operationName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variables, features: retryFeatures, fieldToggles: retryFieldToggles, queryId: retryOp.queryId }),
      });
      return retryRes.json();
    }

    return data;
  };

  const graphqlMutation = async (operationName, variables = {}) => {
    const op = await getOperation(operationName);
    const body = JSON.stringify({
      variables,
      features: buildFeatures(op.featureSwitches),
      fieldToggles: buildFieldToggles(op.fieldToggles),
      queryId: op.queryId,
    });
    const res = await request(`https://x.com/i/api/graphql/${op.queryId}/${operationName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const data = await res.json();

    if (data.errors?.some((e) => e.message?.includes('Could not resolve'))) {
      invalidateCache();
      const retryOp = await getOperation(operationName);
      const retryBody = JSON.stringify({
        variables,
        features: buildFeatures(retryOp.featureSwitches),
        fieldToggles: buildFieldToggles(retryOp.fieldToggles),
        queryId: retryOp.queryId,
      });
      const retryRes = await request(`https://x.com/i/api/graphql/${retryOp.queryId}/${operationName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: retryBody,
      });
      return retryRes.json();
    }

    return data;
  };

  // ── API Methods ──

  const getViewer = async () => {
    const data = await graphqlQuery('Viewer');
    const viewer = data?.data?.viewer?.user_results?.result;
    if (!viewer) throw new Error('Failed to fetch viewer info.');
    return {
      id: viewer.rest_id,
      username: viewer.core?.screen_name || viewer.legacy?.screen_name,
      name: viewer.core?.name || viewer.legacy?.name,
      description: viewer.legacy?.description,
      followerCount: viewer.legacy?.followers_count || viewer.legacy?.normal_followers_count,
      followingCount: viewer.legacy?.friends_count,
      tweetCount: viewer.legacy?.statuses_count,
      isVerified: viewer.is_blue_verified,
      profileImageUrl: viewer.legacy?.profile_image_url_https || viewer.avatar?.image_url,
    };
  };

  const getUserByScreenName = async (screenName) => {
    const data = await graphqlQuery('UserByScreenName', { screen_name: screenName });
    const user = data?.data?.user?.result;
    if (!user) throw new Error(`User not found: ${screenName}`);
    return {
      id: user.rest_id,
      username: user.core?.screen_name || user.legacy?.screen_name,
      name: user.core?.name || user.legacy?.name,
      description: user.legacy?.description,
      followerCount: user.legacy?.followers_count || user.legacy?.normal_followers_count,
      followingCount: user.legacy?.friends_count,
      tweetCount: user.legacy?.statuses_count,
      isVerified: user.is_blue_verified,
      profileImageUrl: user.legacy?.profile_image_url_https || user.avatar?.image_url,
      bannerUrl: user.legacy?.profile_banner_url,
      location: user.legacy?.location,
      url: user.legacy?.url,
      createdAt: user.legacy?.created_at || user.core?.created_at,
    };
  };

  const parseTweet = (entry) => {
    const result = entry?.content?.itemContent?.tweet_results?.result
      || entry?.tweet_results?.result
      || entry;
    const tweet = result?.tweet || result;
    const legacy = tweet?.legacy;
    if (!legacy) return null;

    const userResult = tweet?.core?.user_results?.result;
    const username = userResult?.core?.screen_name || userResult?.legacy?.screen_name;
    const name = userResult?.core?.name || userResult?.legacy?.name;

    return {
      id: legacy.id_str || tweet.rest_id,
      text: legacy.full_text,
      username,
      name,
      likeCount: legacy.favorite_count,
      retweetCount: legacy.retweet_count,
      replyCount: legacy.reply_count,
      quoteCount: legacy.quote_count,
      viewCount: tweet.views?.count ? Number(tweet.views.count) : null,
      createdAt: legacy.created_at,
      url: legacy.id_str ? `https://x.com/i/status/${legacy.id_str}` : null,
      isRetweet: Boolean(legacy.retweeted_status_result),
      isReply: Boolean(legacy.in_reply_to_status_id_str),
      mediaUrls: legacy.entities?.media?.map((m) => m.media_url_https) || [],
    };
  };

  const getUserTweets = async (userId, count = 20) => {
    const data = await graphqlQuery('UserTweets', {
      userId,
      count,
      includePromotedContent: false,
      withQuickPromoteEligibilityTweetFields: false,
      withVoice: false,
      withV2Timeline: true,
    });
    const timeline = data?.data?.user?.result?.timeline_v2?.timeline
      || data?.data?.user?.result?.timeline?.timeline;
    const instructions = timeline?.instructions || [];

    return collectEntries(instructions)
      .map(parseTweet)
      .filter(Boolean);
  };

  const getTweetDetail = async (tweetId) => {
    const data = await graphqlQuery('TweetDetail', {
      focalTweetId: tweetId,
      with_rux_injections: false,
      rankingMode: 'Relevance',
      includePromotedContent: false,
      withCommunity: true,
      withQuickPromoteEligibilityTweetFields: true,
      withBirdwatchNotes: true,
      withVoice: true,
      withV2Timeline: true,
    });
    const instructions = data?.data?.threaded_conversation_with_injections_v2?.instructions || [];
    const entries = instructions
      .find((i) => i.type === 'TimelineAddEntries')?.entries || [];
    const focal = entries.find((e) => e.entryId?.startsWith('tweet-'));
    if (!focal) throw new Error(`Tweet not found: ${tweetId}`);
    return parseTweet(focal);
  };

  const collectEntries = (instructions) => {
    const entries = [];
    for (const inst of instructions) {
      if (inst.type === 'TimelineAddEntries' && inst.entries) {
        entries.push(...inst.entries);
      }
      if (inst.entry) entries.push(inst.entry);
    }
    return entries;
  };

  const getHomeTimeline = async (count = 20) => {
    const data = await graphqlQuery('HomeLatestTimeline', {
      count,
      includePromotedContent: false,
      latestControlAvailable: true,
      requestContext: 'launch',
      withCommunity: true,
    });
    const instructions = data?.data?.home?.home_timeline_urt?.instructions || [];
    return collectEntries(instructions)
      .map(parseTweet)
      .filter(Boolean);
  };

  const searchTimeline = async (query, count = 20) => {
    const data = await graphqlQuery('SearchTimeline', {
      rawQuery: query,
      count,
      querySource: 'typed_query',
      product: 'Latest',
    });
    const instructions = data?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions || [];
    return collectEntries(instructions)
      .map(parseTweet)
      .filter(Boolean);
  };

  // ── Write operations (rate-limited) ──

  const createTweet = (text, options = {}) => withDelay('tweet', async () => {
    const variables = {
      tweet_text: text,
      dark_request: false,
      media: {
        media_entities: options.mediaIds?.map((id) => ({ media_id: id, tagged_users: [] })) || [],
        possibly_sensitive: false,
      },
      semantic_annotation_ids: [],
    };

    if (options.replyTo) {
      variables.reply = {
        in_reply_to_tweet_id: options.replyTo,
        exclude_reply_user_ids: [],
      };
    }

    const data = await graphqlMutation('CreateTweet', variables);

    // Check for errors (e.g., 226 automated request detection)
    if (data.errors?.length) {
      const err = data.errors[0];
      throw new Error(`CreateTweet failed: ${err.message || JSON.stringify(err)}`);
    }

    const result = data?.data?.create_tweet?.tweet_results?.result;
    const tweetId = result?.rest_id || result?.tweet?.rest_id;

    if (!tweetId) {
      throw new Error('CreateTweet: No tweet ID in response. The tweet may not have been created.');
    }

    return {
      id: tweetId,
      text,
      url: `https://x.com/i/status/${tweetId}`,
    };
  });

  const deleteTweet = async (tweetId) => {
    const data = await graphqlMutation('DeleteTweet', { tweet_id: tweetId, dark_request: false });
    return { status: data?.data?.delete_tweet?.tweet_results ? 'ok' : 'fail' };
  };

  const likeTweet = (tweetId) => withDelay('like', async () => {
    const data = await graphqlMutation('FavoriteTweet', { tweet_id: tweetId });
    return { status: data?.data?.favorite_tweet ? 'ok' : 'fail' };
  });

  const unlikeTweet = (tweetId) => withDelay('like', async () => {
    const data = await graphqlMutation('UnfavoriteTweet', { tweet_id: tweetId });
    return { status: data?.data?.unfavorite_tweet ? 'ok' : 'fail' };
  });

  const retweet = (tweetId) => withDelay('retweet', async () => {
    const data = await graphqlMutation('CreateRetweet', { tweet_id: tweetId, dark_request: false });
    return { status: data?.data?.create_retweet?.retweet_results ? 'ok' : 'fail' };
  });

  const unretweet = async (tweetId) => {
    const data = await graphqlMutation('DeleteRetweet', { source_tweet_id: tweetId, dark_request: false });
    return { status: data?.data?.unretweet ? 'ok' : 'fail' };
  };

  // ── Follow / Unfollow (v1.1 REST API) ──

  const followUser = (userId) => withDelay('follow', async () => {
    const body = new URLSearchParams({ user_id: userId });
    const res = await request('https://x.com/i/api/1.1/friendships/create.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = await res.json();
    return { status: data?.id_str ? 'ok' : 'fail', following: true, username: data?.screen_name };
  });

  const unfollowUser = (userId) => withDelay('unfollow', async () => {
    const body = new URLSearchParams({ user_id: userId });
    const res = await request('https://x.com/i/api/1.1/friendships/destroy.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = await res.json();
    return { status: data?.id_str ? 'ok' : 'fail', following: false, username: data?.screen_name };
  });

  // ── Media upload (chunked, v1.1 REST API) ──

  const uploadMedia = async (buffer, mediaType = 'image/jpeg') => {
    const totalBytes = buffer.length;
    const mediaCategory = mediaType.startsWith('video/') ? 'tweet_video'
      : mediaType === 'image/gif' ? 'tweet_gif' : 'tweet_image';

    // INIT
    const initBody = new URLSearchParams({
      command: 'INIT',
      total_bytes: totalBytes.toString(),
      media_type: mediaType,
      media_category: mediaCategory,
    });
    const initRes = await request('https://upload.x.com/i/media/upload.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: initBody.toString(),
    });
    const initData = await initRes.json();
    const mediaId = initData.media_id_string;

    // APPEND (single chunk for images, could extend for video)
    const formData = new FormData();
    formData.append('command', 'APPEND');
    formData.append('media_id', mediaId);
    formData.append('segment_index', '0');
    formData.append('media_data', buffer.toString('base64'));

    await request('https://upload.x.com/i/media/upload.json', {
      method: 'POST',
      body: formData,
    });

    // FINALIZE
    const finalizeBody = new URLSearchParams({
      command: 'FINALIZE',
      media_id: mediaId,
    });
    const finalizeRes = await request('https://upload.x.com/i/media/upload.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: finalizeBody.toString(),
    });
    const finalizeData = await finalizeRes.json();

    // Wait for processing if needed (video)
    if (finalizeData.processing_info) {
      let processing = finalizeData.processing_info;
      while (processing.state === 'pending' || processing.state === 'in_progress') {
        const waitSec = processing.check_after_secs || 5;
        await new Promise((r) => setTimeout(r, waitSec * 1000));
        const statusRes = await request(
          `https://upload.x.com/i/media/upload.json?command=STATUS&media_id=${mediaId}`,
        );
        const statusData = await statusRes.json();
        processing = statusData.processing_info;
        if (!processing) break;
        if (processing.state === 'failed') {
          throw new Error(`Media processing failed: ${processing.error?.message || 'unknown'}`);
        }
      }
    }

    return mediaId;
  };

  const resetState = () => {
    cachedCookies = null;
    countersCache = null;
  };

  return {
    getCookies,
    getCt0,
    getViewer,
    getUserByScreenName,
    getUserTweets,
    getTweetDetail,
    getHomeTimeline,
    searchTimeline,
    createTweet,
    deleteTweet,
    likeTweet,
    unlikeTweet,
    retweet,
    unretweet,
    followUser,
    unfollowUser,
    uploadMedia,
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

module.exports = createXApiClient;
