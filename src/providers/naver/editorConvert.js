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
 * Converts HTML to an array of Naver editor components.
 * Primary: Naver API (upconvert.editor.naver.com)
 * Fallback: Custom parsing
 */
const convertHtmlToEditorComponents = async (naverApi, html, imageComponents = []) => {
  // 1. Try Naver API conversion
  const apiComponents = await naverApi.convertHtmlToComponents(html);
  if (Array.isArray(apiComponents) && apiComponents.length > 0) {
    // Place images at the top of the post (Tistory style)
    return [...imageComponents, ...apiComponents];
  }

  // 2. Fallback: Custom parsing (images placed at the top)
  const textComponents = parseHtmlToComponents(html, []);
  return [...imageComponents, ...textComponents];
};

/**
 * Manually parses HTML and converts it to Naver editor components.
 * Ported from Python's process_html_to_components()
 */
const parseHtmlToComponents = (html, imageComponents = []) => {
  // Split by heading (h1-h6) or strong tags
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

    // Skip heading tags themselves (same as Python code's continue)
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
        // Insert image
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

    // Plain text segment
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
      // Regular paragraphs: split by <p> or <br>
      const paragraphs = text.split(/\n+/).filter((p) => p.trim());
      for (const para of paragraphs) {
        components.push(createTextComponent(para.trim()));
      }
    }
  }

  // Append remaining images
  for (const img of images) {
    components.push(img);
  }

  return components;
};

/**
 * Intersperses images between API-returned components.
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

  // Append remaining images
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
