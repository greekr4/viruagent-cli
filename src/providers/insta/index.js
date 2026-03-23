const { saveProviderMeta, clearProviderMeta, getProviderMeta } = require('../../storage/sessionStore');
const createInstaApiClient = require('./apiClient');
const createSmartComment = require('./smartComment');
const { readInstaCredentials } = require('./utils');
const { createInstaWithProviderSession } = require('./session');
const { createAskForAuthentication } = require('./auth');

const createInstaProvider = ({ sessionPath, account }) => {
  const instaApi = createInstaApiClient({ sessionPath });

  const askForAuthentication = createAskForAuthentication({ sessionPath });

  const withProviderSession = createInstaWithProviderSession(askForAuthentication, account);
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
            metadata: getProviderMeta('insta', account) || {},
          };
        } catch (error) {
          return {
            provider: 'insta',
            loggedIn: false,
            sessionPath,
            error: error.message,
            metadata: getProviderMeta('insta', account) || {},
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
      }, account);

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

    async publish({ imageUrl, imagePath, caption = '', content, title, relatedImageKeywords = [], imageUrls = [] } = {}) {
      return withProviderSession(async () => {
        // Use content as caption if caption is not provided
        const finalCaption = caption || content || '';

        // Resolve image: explicit imageUrl/imagePath > imageUrls > relatedImageKeywords search
        let resolvedImageUrl = imageUrl;
        if (!resolvedImageUrl && !imagePath) {
          if (imageUrls.length > 0) {
            resolvedImageUrl = imageUrls[0];
          } else if (relatedImageKeywords.length > 0) {
            const { buildKeywordImageCandidates } = require('../tistory/imageSources');
            for (const keyword of relatedImageKeywords) {
              const candidates = await buildKeywordImageCandidates(keyword);
              if (candidates.length > 0) {
                resolvedImageUrl = candidates[0];
                break;
              }
            }
          }
        }

        if (!resolvedImageUrl && !imagePath) {
          throw new Error('No image found. Provide --image-urls, --related-image-keywords, or use imageUrl/imagePath.');
        }

        const result = await instaApi.publishPost({ imageUrl: resolvedImageUrl, imagePath, caption: finalCaption });
        return {
          provider: 'insta',
          mode: 'publish',
          ...result,
        };
      });
    },

    async sendDm({ username, threadId, text } = {}) {
      const target = String(username || '').trim();
      const tid = String(threadId || '').trim();
      const msg = String(text || '').trim();
      if (!target && !tid) throw new Error('username or threadId is required.');
      if (!msg) throw new Error('text is required.');

      const { chromium } = require('playwright');
      const path = require('path');
      const userDataDir = path.join(path.dirname(sessionPath), '..', 'browser-data', 'insta');
      const fs = require('fs');
      if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

      // Determine DM URL
      let dmUrl;
      if (tid) {
        dmUrl = `https://www.instagram.com/direct/t/${tid}/`;
      } else {
        dmUrl = `https://www.instagram.com/direct/new/`;
      }

      const context = await chromium.launchPersistentContext(userDataDir, {
        headless: true,
        viewport: { width: 1280, height: 800 },
      });

      try {
        const page = context.pages()[0] || await context.newPage();

        if (!tid && target) {
          // New DM: go to new message, search for user
          await page.goto('https://www.instagram.com/direct/new/', { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(3000);

          // Search for recipient
          const searchInput = page.locator('input[name="queryBox"]').or(page.getByPlaceholder(/검색|Search/i));
          await searchInput.first().waitFor({ timeout: 10000 });
          await searchInput.first().fill(target);
          await page.waitForTimeout(2000);

          // Click the user result
          const userResult = page.locator(`text=${target}`).first();
          await userResult.click();
          await page.waitForTimeout(1000);

          // Click chat/next button
          const chatBtn = page.getByRole('button', { name: /채팅|Chat|다음|Next/i });
          await chatBtn.first().click();
          await page.waitForTimeout(2000);
        } else {
          await page.goto(dmUrl, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(3000);
        }

        // Dismiss popups
        try {
          const btn = page.getByRole('button', { name: /나중에|Not Now/i });
          if (await btn.first().isVisible({ timeout: 2000 })) await btn.first().click();
        } catch {}

        // Send message
        const input = page.locator('[role="textbox"]').first();
        await input.waitFor({ timeout: 10000 });
        await input.click();
        await page.keyboard.type(msg);
        await page.waitForTimeout(500);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(3000);

        return {
          provider: 'insta',
          mode: 'dm',
          to: target || tid,
          text: msg,
          status: 'ok',
        };
      } finally {
        await context.close();
      }
    },

    async listMessages({ threadId } = {}) {
      const tid = String(threadId || '').trim();
      if (!tid) throw new Error('threadId is required.');

      const { chromium } = require('playwright');
      const path = require('path');
      const fs = require('fs');
      const userDataDir = path.join(path.dirname(sessionPath), '..', 'browser-data', 'insta');
      if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

      const context = await chromium.launchPersistentContext(userDataDir, {
        headless: true,
        viewport: { width: 1280, height: 800 },
      });

      try {
        const page = context.pages()[0] || await context.newPage();
        await page.goto(`https://www.instagram.com/direct/t/${tid}/`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(5000);

        // Dismiss popups
        try {
          const btn = page.getByRole('button', { name: /나중에|Not Now/i });
          if (await btn.first().isVisible({ timeout: 2000 })) await btn.first().click();
        } catch {}
        await page.waitForTimeout(1000);

        // Extract messages from DOM
        const messages = await page.evaluate(() => {
          const result = [];
          // Find message containers - Instagram uses div with role="row" or specific data attributes
          const rows = document.querySelectorAll('div[role="row"]');
          rows.forEach((row) => {
            const textEl = row.querySelector('div[dir="auto"]');
            if (!textEl) return;
            const text = textEl.innerText?.trim();
            if (!text) return;

            // Determine if sent or received by checking position/style
            const wrapper = row.closest('[class]');
            const style = wrapper ? window.getComputedStyle(wrapper) : null;
            const isSent = row.innerHTML.includes('rgb(99, 91, 255)') ||
                           row.innerHTML.includes('#635BFF') ||
                           row.querySelector('[style*="flex-end"]') !== null;

            result.push({ text, isSent });
          });
          return result;
        });

        // If role="row" didn't work, try alternative extraction
        if (messages.length === 0) {
          const altMessages = await page.evaluate(() => {
            const result = [];
            const allDivs = document.querySelectorAll('div[dir="auto"]');
            const seen = new Set();
            allDivs.forEach((el) => {
              const text = el.innerText?.trim();
              if (!text || text.length > 500 || seen.has(text)) return;
              // Skip UI elements
              if (['메시지 입력...', '검색', 'Message...'].includes(text)) return;
              if (el.closest('nav') || el.closest('header')) return;
              seen.add(text);

              // Check if element is in right-aligned (sent) bubble
              const rect = el.getBoundingClientRect();
              const isSent = rect.left > window.innerWidth / 2;

              result.push({ text, isSent });
            });
            return result;
          });
          if (altMessages.length > 0) messages.push(...altMessages);
        }

        // Get thread participant name
        const participant = await page.evaluate(() => {
          const header = document.querySelector('header');
          if (!header) return null;
          const spans = header.querySelectorAll('span');
          for (const s of spans) {
            const t = s.innerText?.trim();
            if (t && !['메시지', 'Direct', '뒤로'].includes(t) && t.length < 30) return t;
          }
          return null;
        });

        return {
          provider: 'insta',
          mode: 'messages',
          threadId: tid,
          participant,
          totalCount: messages.length,
          messages,
        };
      } finally {
        await context.close();
      }
    },

    async listComments({ postId } = {}) {
      return withProviderSession(async () => {
        const shortcode = String(postId || '').trim();
        if (!shortcode) {
          throw new Error('postId (shortcode) is required.');
        }
        const comments = await instaApi.getComments(shortcode);
        return {
          provider: 'insta',
          mode: 'comments',
          postId: shortcode,
          totalCount: comments.length,
          comments,
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
      clearProviderMeta('insta', account);
      return {
        provider: 'insta',
        loggedOut: true,
        sessionPath,
      };
    },
  };
};

module.exports = createInstaProvider;
