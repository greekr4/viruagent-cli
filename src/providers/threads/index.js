const fs = require('fs');
const { saveProviderMeta, clearProviderMeta, getProviderMeta } = require('../../storage/sessionStore');
const createThreadsApiClient = require('./apiClient');
const { readThreadsCredentials } = require('./utils');
const { createThreadsWithProviderSession } = require('./session');
const { createAskForAuthentication } = require('./auth');

const createThreadsProvider = ({ sessionPath, account }) => {
  const api = createThreadsApiClient({ sessionPath });

  const askForAuthentication = createAskForAuthentication({ sessionPath });

  const withProviderSession = createThreadsWithProviderSession(askForAuthentication, account);

  return {
    id: 'threads',
    name: 'Threads',

    async authStatus() {
      return withProviderSession(async () => {
        try {
          const session = api.getSession();
          return {
            provider: 'threads',
            loggedIn: true,
            userId: session.userId,
            hasSession: Boolean(session.token),
            sessionPath,
            metadata: getProviderMeta('threads', account) || {},
          };
        } catch (error) {
          return {
            provider: 'threads',
            loggedIn: false,
            sessionPath,
            error: error.message,
            metadata: getProviderMeta('threads', account) || {},
          };
        }
      });
    },

    async login({ username, password } = {}) {
      const creds = readThreadsCredentials();
      const resolved = {
        username: username || creds.username,
        password: password || creds.password,
      };

      if (!resolved.username || !resolved.password) {
        throw new Error(
          'Threads login requires username/password. ' +
          'Please set the THREADS_USERNAME / THREADS_PASSWORD (or INSTA_USERNAME / INSTA_PASSWORD) environment variables.',
        );
      }

      const result = await askForAuthentication(resolved);
      api.resetState();

      saveProviderMeta('threads', {
        loggedIn: result.loggedIn,
        userId: result.userId,
        username: result.username,
        sessionPath: result.sessionPath,
      }, account);

      return result;
    },

    async publish({ content, imageUrls, imageUrl, imagePath, replyTo, caption } = {}) {
      return withProviderSession(async () => {
        const text = content || caption || '';

        // Image thread
        let resolvedImageUrl = imageUrl;
        if (!resolvedImageUrl && !imagePath && imageUrls?.length > 0) {
          resolvedImageUrl = imageUrls[0];
        }

        if (resolvedImageUrl || imagePath) {
          let imageBuffer;
          if (imagePath) {
            imageBuffer = fs.readFileSync(imagePath);
          } else {
            const res = await fetch(resolvedImageUrl);
            if (!res.ok) throw new Error(`Image download failed: ${res.status}`);
            imageBuffer = Buffer.from(await res.arrayBuffer());
          }
          const uploadId = await api.uploadImage(imageBuffer);
          const result = await api.publishImageThread(uploadId, text);
          return { provider: 'threads', mode: 'publish', ...result };
        }

        // Text-only thread
        if (!text) {
          throw new Error('content is required for text threads.');
        }
        const result = await api.publishTextThread(text, replyTo);
        return { provider: 'threads', mode: 'publish', ...result };
      });
    },

    async comment({ postId, text } = {}) {
      return withProviderSession(async () => {
        if (!postId) throw new Error('postId is required.');
        if (!text) throw new Error('text is required.');
        const result = await api.publishTextThread(text, postId);
        return {
          provider: 'threads',
          mode: 'comment',
          replyTo: postId,
          ...result,
        };
      });
    },

    async like({ postId } = {}) {
      return withProviderSession(async () => {
        if (!postId) throw new Error('postId is required.');
        const result = await api.likeThread(postId);
        return { provider: 'threads', mode: 'like', postId, status: result.status };
      });
    },

    async unlike({ postId } = {}) {
      return withProviderSession(async () => {
        if (!postId) throw new Error('postId is required.');
        const result = await api.unlikeThread(postId);
        return { provider: 'threads', mode: 'unlike', postId, status: result.status };
      });
    },

    async follow({ username } = {}) {
      return withProviderSession(async () => {
        if (!username) throw new Error('username is required.');
        const userId = await api.getUserId(username);
        const result = await api.followUser(userId);
        return {
          provider: 'threads',
          mode: 'follow',
          username,
          userId,
          following: result.following,
          outgoingRequest: result.outgoingRequest,
          status: result.status,
        };
      });
    },

    async unfollow({ username } = {}) {
      return withProviderSession(async () => {
        if (!username) throw new Error('username is required.');
        const userId = await api.getUserId(username);
        const result = await api.unfollowUser(userId);
        return {
          provider: 'threads',
          mode: 'unfollow',
          username,
          userId,
          following: result.following,
          status: result.status,
        };
      });
    },

    async getProfile({ username } = {}) {
      return withProviderSession(async () => {
        if (!username) throw new Error('username is required.');
        const userId = await api.getUserId(username);
        const profile = await api.getUserProfile(userId);
        return { provider: 'threads', mode: 'profile', ...profile };
      });
    },

    async getFeed() {
      return withProviderSession(async () => {
        const items = await api.getTimeline();
        return {
          provider: 'threads',
          mode: 'feed',
          count: items.length,
          items,
        };
      });
    },

    async listPosts({ username, limit = 20 } = {}) {
      return withProviderSession(async () => {
        if (!username) throw new Error('username is required.');
        const userId = await api.getUserId(username);
        const posts = await api.getUserThreads(userId, limit);
        return {
          provider: 'threads',
          mode: 'posts',
          username,
          totalCount: posts.length,
          posts,
        };
      });
    },

    async search({ query, limit = 20 } = {}) {
      return withProviderSession(async () => {
        if (!query) throw new Error('query is required.');
        const users = await api.searchUsers(query, limit);
        return {
          provider: 'threads',
          mode: 'search',
          query,
          totalCount: users.length,
          users,
        };
      });
    },

    async deletePost({ postId } = {}) {
      return withProviderSession(async () => {
        if (!postId) throw new Error('postId is required.');
        const result = await api.deleteThread(postId);
        return {
          provider: 'threads',
          mode: 'delete',
          postId,
          status: result.status,
        };
      });
    },

    rateLimitStatus() {
      return {
        provider: 'threads',
        mode: 'rateLimitStatus',
        ...api.getRateLimitStatus(),
      };
    },

    async logout() {
      clearProviderMeta('threads', account);
      return {
        provider: 'threads',
        loggedOut: true,
        sessionPath,
      };
    },
  };
};

module.exports = createThreadsProvider;
