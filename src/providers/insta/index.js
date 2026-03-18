const { saveProviderMeta, clearProviderMeta, getProviderMeta } = require('../../storage/sessionStore');
const createInstaApiClient = require('./apiClient');
const createSmartComment = require('./smartComment');
const { readInstaCredentials } = require('./utils');
const { createInstaWithProviderSession } = require('./session');
const { createAskForAuthentication } = require('./auth');

const createInstaProvider = ({ sessionPath }) => {
  const instaApi = createInstaApiClient({ sessionPath });

  const askForAuthentication = createAskForAuthentication({ sessionPath });

  const withProviderSession = createInstaWithProviderSession(askForAuthentication);
  const smart = createSmartComment(instaApi);

  return {
    id: 'insta',
    name: 'Instagram',

    async authStatus() {
      return withProviderSession(async () => {
        try {
          const userId = instaApi.getUserId();
          const cookies = instaApi.getCookies();
          const sessionid = cookies.find((c) => c.name === 'sessionid');
          return {
            provider: 'insta',
            loggedIn: true,
            userId,
            hasSession: Boolean(sessionid?.value),
            sessionPath,
            metadata: getProviderMeta('insta') || {},
          };
        } catch (error) {
          return {
            provider: 'insta',
            loggedIn: false,
            sessionPath,
            error: error.message,
            metadata: getProviderMeta('insta') || {},
          };
        }
      });
    },

    async login({ username, password } = {}) {
      const creds = readInstaCredentials();
      const resolved = {
        username: username || creds.username,
        password: password || creds.password,
      };

      if (!resolved.username || !resolved.password) {
        throw new Error(
          'Instagram login requires username/password. ' +
          'Please set the INSTA_USERNAME / INSTA_PASSWORD environment variables.',
        );
      }

      const result = await askForAuthentication(resolved);
      instaApi.resetState();

      saveProviderMeta('insta', {
        loggedIn: result.loggedIn,
        userId: result.userId,
        username: result.username,
        sessionPath: result.sessionPath,
      });

      return result;
    },

    async getProfile({ username } = {}) {
      return withProviderSession(async () => {
        if (!username) {
          throw new Error('username is required.');
        }
        const profile = await instaApi.getProfile(username);
        return {
          provider: 'insta',
          mode: 'profile',
          ...profile,
        };
      });
    },

    async getFeed() {
      return withProviderSession(async () => {
        const items = await instaApi.getFeed();
        return {
          provider: 'insta',
          mode: 'feed',
          count: items.length,
          items,
        };
      });
    },

    async listPosts({ username, limit = 12 } = {}) {
      return withProviderSession(async () => {
        if (!username) {
          throw new Error('username is required.');
        }
        const posts = await instaApi.getUserPosts(username, limit);
        return {
          provider: 'insta',
          mode: 'posts',
          username,
          totalCount: posts.length,
          posts,
        };
      });
    },

    async getPost({ postId } = {}) {
      return withProviderSession(async () => {
        const shortcode = String(postId || '').trim();
        if (!shortcode) {
          return {
            provider: 'insta',
            mode: 'post',
            status: 'invalid_post_id',
            message: 'postId (shortcode) is required.',
          };
        }
        const post = await instaApi.getPostDetail(shortcode);
        return {
          provider: 'insta',
          mode: 'post',
          ...post,
        };
      });
    },

    async follow({ username } = {}) {
      return withProviderSession(async () => {
        if (!username) throw new Error('username is required.');
        const profile = await instaApi.getProfile(username);
        const result = await instaApi.followUser(profile.id);
        return {
          provider: 'insta',
          mode: 'follow',
          username,
          userId: profile.id,
          following: result.following,
          outgoingRequest: result.outgoingRequest,
          status: result.status,
        };
      });
    },

    async unfollow({ username } = {}) {
      return withProviderSession(async () => {
        if (!username) throw new Error('username is required.');
        const profile = await instaApi.getProfile(username);
        const result = await instaApi.unfollowUser(profile.id);
        return {
          provider: 'insta',
          mode: 'unfollow',
          username,
          userId: profile.id,
          following: result.following,
          status: result.status,
        };
      });
    },

    async like({ postId } = {}) {
      return withProviderSession(async () => {
        const shortcode = String(postId || '').trim();
        if (!shortcode) throw new Error('postId (shortcode) is required.');
        const mediaId = await instaApi.getMediaIdFromShortcode(shortcode);
        const result = await instaApi.likePost(mediaId);
        return { provider: 'insta', mode: 'like', postId: shortcode, status: result.status };
      });
    },

    async unlike({ postId } = {}) {
      return withProviderSession(async () => {
        const shortcode = String(postId || '').trim();
        if (!shortcode) throw new Error('postId (shortcode) is required.');
        const mediaId = await instaApi.getMediaIdFromShortcode(shortcode);
        const result = await instaApi.unlikePost(mediaId);
        return { provider: 'insta', mode: 'unlike', postId: shortcode, status: result.status };
      });
    },

    async likeComment({ commentId } = {}) {
      return withProviderSession(async () => {
        if (!commentId) throw new Error('commentId is required.');
        const result = await instaApi.likeComment(commentId);
        return { provider: 'insta', mode: 'likeComment', commentId, status: result.status };
      });
    },

    async unlikeComment({ commentId } = {}) {
      return withProviderSession(async () => {
        if (!commentId) throw new Error('commentId is required.');
        const result = await instaApi.unlikeComment(commentId);
        return { provider: 'insta', mode: 'unlikeComment', commentId, status: result.status };
      });
    },

    async comment({ postId, text } = {}) {
      return withProviderSession(async () => {
        const shortcode = String(postId || '').trim();
        const commentText = String(text || '').trim();
        if (!shortcode) {
          throw new Error('postId (shortcode) is required.');
        }
        if (!commentText) {
          throw new Error('Comment text is required.');
        }
        const mediaId = await instaApi.getMediaIdFromShortcode(shortcode);
        const result = await instaApi.addComment(mediaId, commentText);
        return {
          provider: 'insta',
          mode: 'comment',
          postId: shortcode,
          commentId: result.id,
          text: result.text,
          from: result.from?.username,
          status: result.status,
        };
      });
    },

    async publish({ imageUrl, imagePath, caption = '' } = {}) {
      return withProviderSession(async () => {
        if (!imageUrl && !imagePath) {
          throw new Error('Either imageUrl or imagePath is required.');
        }
        const result = await instaApi.publishPost({ imageUrl, imagePath, caption });
        return {
          provider: 'insta',
          mode: 'publish',
          ...result,
        };
      });
    },

    async analyzePost({ postId } = {}) {
      return withProviderSession(async () => {
        const shortcode = String(postId || '').trim();
        if (!shortcode) {
          throw new Error('postId (shortcode) is required.');
        }
        const analysis = await smart.analyzePost({ shortcode });
        return {
          provider: 'insta',
          mode: 'analyze',
          ...analysis,
        };
      });
    },

    async deletePost({ postId } = {}) {
      return withProviderSession(async () => {
        const shortcode = String(postId || '').trim();
        if (!shortcode) {
          throw new Error('postId (shortcode) is required.');
        }
        const mediaId = await instaApi.getMediaIdFromShortcode(shortcode);
        const result = await instaApi.deletePost(mediaId);
        return {
          provider: 'insta',
          mode: 'delete',
          postId: shortcode,
          status: result.status,
        };
      });
    },

    async resolveChallenge() {
      const resolved = await instaApi.resolveChallenge();
      return {
        provider: 'insta',
        mode: 'resolveChallenge',
        resolved,
        message: resolved ? 'Challenge resolved successfully.' : 'Challenge resolution failed. Please handle it manually in the browser.',
      };
    },

    rateLimitStatus() {
      return {
        provider: 'insta',
        mode: 'rateLimitStatus',
        ...instaApi.getRateLimitStatus(),
      };
    },

    async logout() {
      clearProviderMeta('insta');
      return {
        provider: 'insta',
        loggedOut: true,
        sessionPath,
      };
    },
  };
};

module.exports = createInstaProvider;
