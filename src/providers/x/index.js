const fs = require('fs');
const path = require('path');
const { saveProviderMeta, clearProviderMeta, getProviderMeta } = require('../../storage/sessionStore');
const createXApiClient = require('./apiClient');
const { readXCredentials } = require('./utils');
const { createXWithProviderSession } = require('./session');
const { createSetCredentials } = require('./auth');
const { syncGraphqlOperations } = require('./graphqlSync');

const createXProvider = ({ sessionPath, account }) => {
  const xApi = createXApiClient({ sessionPath });

  const setCredentials = createSetCredentials({ sessionPath });

  const withProviderSession = createXWithProviderSession(setCredentials, account);

  return {
    id: 'x',
    name: 'X (Twitter)',

    async authStatus() {
      return withProviderSession(async () => {
        try {
          const viewer = await xApi.getViewer();
          return {
            provider: 'x',
            loggedIn: true,
            username: viewer.username,
            name: viewer.name,
            followerCount: viewer.followerCount,
            tweetCount: viewer.tweetCount,
            sessionPath,
            metadata: getProviderMeta('x', account) || {},
          };
        } catch (error) {
          return {
            provider: 'x',
            loggedIn: false,
            sessionPath,
            error: error.message,
            metadata: getProviderMeta('x', account) || {},
          };
        }
      });
    },

    async login({ authToken, ct0 } = {}) {
      const creds = readXCredentials();
      const resolved = {
        authToken: authToken || creds.authToken,
        ct0: ct0 || creds.ct0,
      };

      if (!resolved.authToken || !resolved.ct0) {
        throw new Error(
          'X login requires auth_token and ct0 cookies. ' +
          'Please set X_AUTH_TOKEN / X_CT0 environment variables.',
        );
      }

      const result = await setCredentials(resolved);
      xApi.resetState();

      saveProviderMeta('x', {
        loggedIn: result.loggedIn,
        username: result.username,
        sessionPath: result.sessionPath,
      }, account);

      return result;
    },

    async getProfile({ username } = {}) {
      return withProviderSession(async () => {
        if (!username) throw new Error('username is required.');
        const profile = await xApi.getUserByScreenName(username);
        return { provider: 'x', mode: 'profile', ...profile };
      });
    },

    async getFeed({ count = 20 } = {}) {
      return withProviderSession(async () => {
        const items = await xApi.getHomeTimeline(count);
        return {
          provider: 'x',
          mode: 'feed',
          count: items.length,
          items,
        };
      });
    },

    async listPosts({ username, limit = 20 } = {}) {
      return withProviderSession(async () => {
        if (!username) throw new Error('username is required.');
        const user = await xApi.getUserByScreenName(username);
        const posts = await xApi.getUserTweets(user.id, limit);
        return {
          provider: 'x',
          mode: 'posts',
          username,
          totalCount: posts.length,
          posts,
        };
      });
    },

    async getPost({ postId } = {}) {
      return withProviderSession(async () => {
        const tweetId = String(postId || '').trim();
        if (!tweetId) throw new Error('postId (tweet ID) is required.');
        const tweet = await xApi.getTweetDetail(tweetId);
        return { provider: 'x', mode: 'post', ...tweet };
      });
    },

    async search({ query, limit = 20 } = {}) {
      return withProviderSession(async () => {
        if (!query) throw new Error('query is required.');
        const results = await xApi.searchTimeline(query, limit);
        return {
          provider: 'x',
          mode: 'search',
          query,
          totalCount: results.length,
          results,
        };
      });
    },

    async publish({ text, content, mediaUrl, mediaPath, replyTo } = {}) {
      return withProviderSession(async () => {
        const tweetText = text || content || '';
        if (!tweetText) throw new Error('Tweet text is required.');

        let mediaIds;
        if (mediaUrl || mediaPath) {
          let buffer;
          if (mediaPath) {
            buffer = fs.readFileSync(path.resolve(mediaPath));
          } else {
            const res = await fetch(mediaUrl);
            if (!res.ok) throw new Error(`Image download failed: ${res.status}`);
            buffer = Buffer.from(await res.arrayBuffer());
          }
          const mediaId = await xApi.uploadMedia(buffer);
          mediaIds = [mediaId];
        }

        const result = await xApi.createTweet(tweetText, { mediaIds, replyTo });
        return {
          provider: 'x',
          mode: 'publish',
          ...result,
        };
      });
    },

    async delete({ postId } = {}) {
      return withProviderSession(async () => {
        const tweetId = String(postId || '').trim();
        if (!tweetId) throw new Error('postId (tweet ID) is required.');
        const result = await xApi.deleteTweet(tweetId);
        return { provider: 'x', mode: 'delete', postId: tweetId, ...result };
      });
    },

    async like({ postId } = {}) {
      return withProviderSession(async () => {
        const tweetId = String(postId || '').trim();
        if (!tweetId) throw new Error('postId (tweet ID) is required.');
        const result = await xApi.likeTweet(tweetId);
        return { provider: 'x', mode: 'like', postId: tweetId, ...result };
      });
    },

    async unlike({ postId } = {}) {
      return withProviderSession(async () => {
        const tweetId = String(postId || '').trim();
        if (!tweetId) throw new Error('postId (tweet ID) is required.');
        const result = await xApi.unlikeTweet(tweetId);
        return { provider: 'x', mode: 'unlike', postId: tweetId, ...result };
      });
    },

    async follow({ username } = {}) {
      return withProviderSession(async () => {
        if (!username) throw new Error('username is required.');
        const user = await xApi.getUserByScreenName(username);
        const result = await xApi.followUser(user.id);
        return { provider: 'x', mode: 'follow', username, userId: user.id, ...result };
      });
    },

    async unfollow({ username } = {}) {
      return withProviderSession(async () => {
        if (!username) throw new Error('username is required.');
        const user = await xApi.getUserByScreenName(username);
        const result = await xApi.unfollowUser(user.id);
        return { provider: 'x', mode: 'unfollow', username, userId: user.id, ...result };
      });
    },

    async retweet({ postId } = {}) {
      return withProviderSession(async () => {
        const tweetId = String(postId || '').trim();
        if (!tweetId) throw new Error('postId (tweet ID) is required.');
        const result = await xApi.retweet(tweetId);
        return { provider: 'x', mode: 'retweet', postId: tweetId, ...result };
      });
    },

    async unretweet({ postId } = {}) {
      return withProviderSession(async () => {
        const tweetId = String(postId || '').trim();
        if (!tweetId) throw new Error('postId (tweet ID) is required.');
        const result = await xApi.unretweet(tweetId);
        return { provider: 'x', mode: 'unretweet', postId: tweetId, ...result };
      });
    },

    rateLimitStatus() {
      return {
        provider: 'x',
        mode: 'rateLimitStatus',
        ...xApi.getRateLimitStatus(),
      };
    },

    async syncOperations() {
      const ops = await syncGraphqlOperations({ force: true });
      return {
        provider: 'x',
        mode: 'syncOperations',
        operationCount: ops.size,
        message: `Synced ${ops.size} GraphQL operations from x.com`,
      };
    },

    async logout() {
      clearProviderMeta('x', account);
      return {
        provider: 'x',
        loggedOut: true,
        sessionPath,
      };
    },
  };
};

module.exports = createXProvider;
