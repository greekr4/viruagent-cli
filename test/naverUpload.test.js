const assert = require('assert');
const createNaverApiClient = require('../src/services/naverApiClient');

const {
  resolveUploadUserId,
  inferImageMimeType,
  extractUploadError,
} = createNaverApiClient._private;

const sessionKey = Buffer.from([
  '20260914043155',
  '1789327934975',
  'blog_editor2',
  'eun9805',
  '0',
  '2',
  'token',
].join('\x07')).toString('base64');

assert.equal(resolveUploadUserId(sessionKey, 'blog-slug'), 'eun9805');
assert.equal(resolveUploadUserId('', 'blog-slug'), 'blog-slug');
assert.equal(inferImageMimeType('chart.PNG'), 'image/png');
assert.equal(inferImageMimeType('photo.webp'), 'image/webp');
assert.equal(inferImageMimeType('photo.gif'), 'image/gif');
assert.equal(inferImageMimeType('photo.jpg'), 'image/jpeg');
assert.equal(
  extractUploadError('<reason><code>LOGIN</code><cause>LOGIN</cause></reason>'),
  'LOGIN'
);

console.log('naver upload helpers: ok');
