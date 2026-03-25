const { saveProviderMeta, clearProviderMeta, getProviderMeta } = require('../../storage/sessionStore');
const createRedditApiClient = require('./apiClient');
const { readRedditCredentials } = require('./utils');
const { createRedditWithProviderSession } = require('./session');
const { createLogin } = require('./auth');

const createRedditProvider = ({ sessionPath, account }) => {
  const redditApi = createRedditApiClient({ sessionPath });

  const loginFn = createLogin({ sessionPath });

  const withProviderSession = createRedditWithProviderSession(loginFn, account);

  return {
    id: 'reddit',
    name: 'Reddit',

    async authStatus() {
      return withProviderSession(async () => {
        try {
          const me = await redditApi.getMe();
          return {
            provider: 'reddit',
            loggedIn: true,
            username: me.username,
            karma: me.totalKarma,
            sessionPath,
            metadata: getProviderMeta('reddit', account) || {},
          };
        } catch (error) {
          return {
            provider: 'reddit',
            loggedIn: false,
            sessionPath,
            error: error.message,
            metadata: getProviderMeta('reddit', account) || {},
          };
        }
      });
    },

    async login({ clientId, clientSecret, username, password, headless, manual } = {}) {
      const creds = readRedditCredentials();
      const resolved = {
        clientId: clientId || creds.clientId,
        clientSecret: clientSecret || creds.clientSecret,
        username: username || creds.username,
        password: password || creds.password,
        headless,
        manual,
      };

      if (!resolved.username || !resolved.password) {
        throw new Error(
          'Reddit login requires username and password. ' +
          'Set REDDIT_USERNAME / REDDIT_PASSWORD environment variables. ' +
          'For OAuth, also set REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET.',
        );
      }

      const result = await loginFn(resolved);
      redditApi.resetState();

      saveProviderMeta('reddit', {
        loggedIn: result.loggedIn,
        username: result.username,
        sessionPath: result.sessionPath,
      }, account);

      return result;
    },

    async logout() {
      clearProviderMeta('reddit', account);
      return {
        provider: 'reddit',
        loggedOut: true,
        sessionPath,
      };
    },

    async publish({ subreddit, title, content, text, kind = 'self', url, flair } = {}) {
      return withProviderSession(async () => {
        if (!subreddit) throw new Error('subreddit is required.');
        if (!title) throw new Error('title is required.');
        const postText = content || text || '';
        // For link posts, use content as URL if url is not explicitly provided
        const linkUrl = url || (kind === 'link' ? postText.trim() : undefined);
        const result = await redditApi.submitPost({ subreddit, title, text: kind === 'self' ? postText : undefined, kind, url: linkUrl, flair });
        return {
          provider: 'reddit',
          mode: 'publish',
          ...result,
        };
      });
    },

    async getProfile({ username } = {}) {
      return withProviderSession(async () => {
        if (!username) {
          const me = await redditApi.getMe();
          return { provider: 'reddit', mode: 'profile', ...me };
        }
        // For other users, fetch their posts as profile proxy
        const posts = await redditApi.getUserPosts({ username, limit: 1 });
        return {
          provider: 'reddit',
          mode: 'profile',
          username,
          recentPostCount: posts.length,
        };
      });
    },

    async getFeed({ subreddit, sort = 'hot', limit = 25 } = {}) {
      return withProviderSession(async () => {
        if (!subreddit) throw new Error('subreddit is required for Reddit feed.');
        const items = await redditApi.getSubredditPosts({ subreddit, sort, limit });
        return {
          provider: 'reddit',
          mode: 'feed',
          subreddit,
          sort,
          count: items.length,
          items,
        };
      });
    },

    async listPosts({ username, limit = 25 } = {}) {
      return withProviderSession(async () => {
        const resolvedUsername = username || (await redditApi.getMe()).username;
        const posts = await redditApi.getUserPosts({ username: resolvedUsername, limit });
        return {
          provider: 'reddit',
          mode: 'posts',
          username: resolvedUsername,
          totalCount: posts.length,
          posts,
        };
      });
    },

    async getPost({ postId } = {}) {
      return withProviderSession(async () => {
        if (!postId) throw new Error('postId is required.');
        const post = await redditApi.getPost({ postId });
        return { provider: 'reddit', mode: 'post', ...post };
      });
    },

    async search({ query, subreddit, limit = 25 } = {}) {
      return withProviderSession(async () => {
        if (!query) throw new Error('query is required.');
        const results = await redditApi.search({ query, subreddit, limit });
        return {
          provider: 'reddit',
          mode: 'search',
          query,
          subreddit: subreddit || null,
          totalCount: results.length,
          results,
        };
      });
    },

    async comment({ postId, text } = {}) {
      return withProviderSession(async () => {
        if (!postId || !text) throw new Error('postId and text are required.');
        const cleanId = String(postId).replace(/^t3_/, '');
        const parentFullname = `t3_${cleanId}`;
        const result = await redditApi.comment({ parentFullname, text });
        return { provider: 'reddit', mode: 'comment', postId, ...result };
      });
    },

    async like({ postId } = {}) {
      return withProviderSession(async () => {
        if (!postId) throw new Error('postId is required.');
        const cleanId = String(postId).replace(/^t3_/, '');
        const fullname = `t3_${cleanId}`;
        const result = await redditApi.vote({ fullname, direction: 1 });
        return { provider: 'reddit', mode: 'like', postId, ...result };
      });
    },

    async unlike({ postId } = {}) {
      return withProviderSession(async () => {
        if (!postId) throw new Error('postId is required.');
        const cleanId = String(postId).replace(/^t3_/, '');
        const fullname = `t3_${cleanId}`;
        const result = await redditApi.vote({ fullname, direction: 0 });
        return { provider: 'reddit', mode: 'unlike', postId, ...result };
      });
    },

    async subscribe({ subreddit } = {}) {
      return withProviderSession(async () => {
        if (!subreddit) throw new Error('subreddit is required.');
        const result = await redditApi.subscribe({ subreddit });
        return { provider: 'reddit', mode: 'subscribe', ...result };
      });
    },

    async unsubscribe({ subreddit } = {}) {
      return withProviderSession(async () => {
        if (!subreddit) throw new Error('subreddit is required.');
        const result = await redditApi.unsubscribe({ subreddit });
        return { provider: 'reddit', mode: 'unsubscribe', ...result };
      });
    },

    async delete({ postId } = {}) {
      return withProviderSession(async () => {
        if (!postId) throw new Error('postId is required.');
        const cleanId = String(postId).replace(/^t3_/, '');
        const fullname = `t3_${cleanId}`;
        const result = await redditApi.deletePost({ fullname });
        return { provider: 'reddit', mode: 'delete', postId, ...result };
      });
    },

    rateLimitStatus() {
      return {
        provider: 'reddit',
        mode: 'rateLimitStatus',
        ...redditApi.getRateLimitStatus(),
      };
    },
  };
};

module.exports = createRedditProvider;
