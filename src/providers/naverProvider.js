const createNaverProvider = () => {
  const unavailable = (operation) => ({
    provider: 'naver',
    ready: false,
    operation,
    message: 'Naver provider is not implemented yet. Use tistory first.',
  });

  return {
    id: 'naver',
    name: 'Naver',

    async authStatus() {
      return unavailable('auth_status');
    },

    async login() {
      return unavailable('login');
    },

    async publish() {
      return unavailable('publish');
    },

    async saveDraft() {
      return unavailable('saveDraft');
    },

    async listCategories() {
      return unavailable('listCategories');
    },

    async listPosts() {
      return unavailable('listPosts');
    },

    async getPost() {
      return unavailable('getPost');
    },

    async logout() {
      return {
        provider: 'naver',
        loggedOut: true,
      };
    },
  };
};

module.exports = createNaverProvider;
