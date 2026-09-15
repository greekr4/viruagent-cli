const assert = require('assert');
const {
  convertHtmlToEditorComponents,
  splitHtmlWithImageMarkers,
} = require('../src/providers/naver/editorConvert');

const fakeApi = {
  async convertHtmlToComponents(html) {
    const text = String(html || '').replace(/<[^>]+>/g, '').trim();
    return text ? [{ '@ctype': 'text', text }] : [];
  },
};

const images = [
  { '@ctype': 'image', fileName: 'one.png' },
  { '@ctype': 'image', fileName: 'two.png' },
  { '@ctype': 'image', fileName: 'three.png' },
];

(async () => {
  const parts = splitHtmlWithImageMarkers('<p>A</p><!-- VIRU_IMAGE:2 --><p>B</p>');
  assert.deepEqual(parts.map((p) => p.type), ['html', 'image', 'html']);
  assert.equal(parts[1].index, 1);

  const ordered = await convertHtmlToEditorComponents(
    fakeApi,
    '<p>A</p><!-- VIRU_IMAGE:2 --><p>B</p><!-- VIRU_IMAGE:1 -->',
    images
  );
  assert.deepEqual(
    ordered.map((item) => item.fileName || item.text),
    ['A', 'two.png', 'B', 'one.png', 'three.png']
  );

  const legacy = await convertHtmlToEditorComponents(fakeApi, '<p>A</p>', images);
  assert.deepEqual(
    legacy.map((item) => item.fileName || item.text),
    ['one.png', 'two.png', 'three.png', 'A']
  );

  await assert.rejects(
    () => convertHtmlToEditorComponents(fakeApi, '<!-- VIRU_IMAGE:4 -->', images),
    /out of range/
  );
  await assert.rejects(
    () => convertHtmlToEditorComponents(fakeApi, '<!-- VIRU_IMAGE:1 --><!-- VIRU_IMAGE:1 -->', images),
    /duplicated/
  );
  await assert.rejects(
    () => convertHtmlToEditorComponents(fakeApi, '<!-- VIRU_IMAGE:2 -->', [images[0], null]),
    /failed to upload/
  );

  console.log('naver inline image placement: ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
