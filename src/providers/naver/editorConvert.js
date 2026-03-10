const crypto = require('crypto');

const seId = () => `SE-${crypto.randomUUID()}`;

const createTextComponent = (text, { fontSize = 'fs16', bold = 'false', align = 'left', lineHeight = '1.8', ctype = 'text' } = {}) => ({
  id: seId(),
  layout: 'default',
  value: [{
    id: seId(),
    nodes: [{
      id: seId(),
      value: text,
      style: {
        fontColor: '#333333',
        fontSizeCode: fontSize,
        bold,
        '@ctype': 'nodeStyle',
      },
      '@ctype': 'textNode',
    }],
    style: {
      align,
      lineHeight,
      '@ctype': 'paragraphStyle',
    },
    '@ctype': 'paragraph',
  }],
  '@ctype': ctype,
});

const createImageComponent = (imgData) => ({
  id: seId(),
  layout: 'default',
  align: 'center',
  src: `https://blogfiles.pstatic.net/${imgData.url}?type=w1`,
  internalResource: 'true',
  represent: imgData.represent || 'false',
  path: imgData.url,
  domain: 'https://blogfiles.pstatic.net',
  fileSize: imgData.fileSize,
  width: imgData.width,
  widthPercentage: 0,
  height: imgData.height,
  originalWidth: imgData.width,
  originalHeight: imgData.height,
  fileName: imgData.fileName,
  caption: null,
  format: 'normal',
  displayFormat: 'normal',
  imageLoaded: 'true',
  contentMode: 'normal',
  origin: {
    srcFrom: 'local',
    '@ctype': 'imageOrigin',
  },
  ai: 'false',
  '@ctype': 'image',
});

const stripHtmlTags = (html) => html.replace(/<[^>]*>/g, '');

/**
 * HTML을 네이버 에디터 컴포넌트 배열로 변환한다.
 * Primary: 네이버 API (upconvert.editor.naver.com)
 * Fallback: 커스텀 파싱
 */
const convertHtmlToEditorComponents = async (naverApi, html, imageComponents = []) => {
  // 1. 네이버 API 변환 시도
  const apiComponents = await naverApi.convertHtmlToComponents(html);
  if (Array.isArray(apiComponents) && apiComponents.length > 0) {
    // 이미지를 글 맨 위에 배치 (티스토리 스타일)
    return [...imageComponents, ...apiComponents];
  }

  // 2. Fallback: 커스텀 파싱 (이미지를 글 맨 위에 배치)
  const textComponents = parseHtmlToComponents(html, []);
  return [...imageComponents, ...textComponents];
};

/**
 * HTML을 수동으로 파싱하여 네이버 에디터 컴포넌트로 변환한다.
 * Python의 process_html_to_components() 포팅
 */
const parseHtmlToComponents = (html, imageComponents = []) => {
  // heading(h1-h6) 또는 strong 태그 기준으로 분할
  const segments = html.split(/(<h[1-6][^>]*>.*?<\/h[1-6]>|<strong>.*?<\/strong>)/is);
  const components = [];
  const images = [...imageComponents];
  let firstHeadingSeen = false;

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    const isHeading = /^<h[1-6]/i.test(trimmed);
    const isStrong = /<strong>/i.test(trimmed);
    const isBoldSection = isHeading || isStrong;

    // heading 태그 자체는 건너뛰기 (Python 코드의 continue와 동일)
    if (/^<h[1-6][^>]*>.*<\/h[1-6]>$/is.test(trimmed)) {
      const text = stripHtmlTags(trimmed);
      if (!text.trim()) continue;

      if (!firstHeadingSeen) {
        firstHeadingSeen = true;
        components.push(createTextComponent(text, {
          fontSize: 'fs38',
          bold: 'true',
          align: 'center',
          lineHeight: '2.1',
          ctype: 'text',
        }));
      } else {
        // 이미지 삽입
        if (images.length > 0) {
          components.push(images.shift());
        }
        components.push(createTextComponent(text, {
          fontSize: 'fs24',
          bold: 'true',
          align: 'center',
          ctype: 'quotation',
        }));
      }
      continue;
    }

    // 일반 텍스트 세그먼트
    const text = stripHtmlTags(trimmed);
    if (!text.trim()) continue;

    if (isBoldSection && !firstHeadingSeen) {
      firstHeadingSeen = true;
      components.push(createTextComponent(text, {
        fontSize: 'fs24',
        bold: 'true',
        lineHeight: '2.1',
      }));
    } else if (isBoldSection) {
      if (images.length > 0) {
        components.push(images.shift());
      }
      components.push(createTextComponent(text, {
        fontSize: 'fs24',
        bold: 'true',
        ctype: 'quotation',
      }));
    } else {
      // 일반 단락: <p> 또는 <br> 기준으로 분할
      const paragraphs = text.split(/\n+/).filter((p) => p.trim());
      for (const para of paragraphs) {
        components.push(createTextComponent(para.trim()));
      }
    }
  }

  // 남은 이미지 append
  for (const img of images) {
    components.push(img);
  }

  return components;
};

/**
 * API 반환 컴포넌트 사이에 이미지를 삽입한다.
 */
const intersperse = (components, imageComponents) => {
  if (!imageComponents.length) return components;

  const result = [];
  const images = [...imageComponents];
  let headingCount = 0;

  for (const comp of components) {
    const isQuotation = comp['@ctype'] === 'quotation';
    if (isQuotation && headingCount > 0 && images.length > 0) {
      result.push(images.shift());
    }
    if (isQuotation) headingCount++;
    result.push(comp);
  }

  // 남은 이미지 append
  for (const img of images) {
    result.push(img);
  }

  return result;
};

module.exports = {
  convertHtmlToEditorComponents,
  parseHtmlToComponents,
  createTextComponent,
  createImageComponent,
  seId,
};
