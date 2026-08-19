const assert = require('node:assert/strict');
const { extractClientWebJsUrls } = require('../src/providers/x/graphqlSync');

const html = [
  '<script src="https://abs.twimg.com/responsive-web/client-web/main.abc123.js"></script>',
  '<script src="//abs.twimg.com/responsive-web/client-web/bundle.Home.def456.js"></script>',
  '<script src="/responsive-web/client-web/main.abc123.js"></script>',
].join('');

assert.deepEqual(extractClientWebJsUrls(html), [
  'https://abs.twimg.com/responsive-web/client-web/main.abc123.js',
  'https://abs.twimg.com/responsive-web/client-web/bundle.Home.def456.js',
]);

console.log('graphqlSync URL extraction: ok');
