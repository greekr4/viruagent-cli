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

const IMAGE_MARKER_PATTERN = /<!--\s*VIRU_IMAGE:(\d+)\s*-->/gi;

const splitHtmlWithImageMarkers = (html = '') => {
  const parts = [];
  const pattern = new RegExp(IMAGE_MARKER_PATTERN.source, IMAGE_MARKER_PATTERN.flags);
  let cursor = 0;
  let match;

  while ((match = pattern.exec(html)) !== null) {
    if (match.index > cursor) {
      parts.push({ type: 'html', content: html.slice(cursor, match.index) });
    }
    parts.push({ type: 'image', index: Number(match[1]) - 1 });
    cursor = pattern.lastIndex;
  }

  if (cursor < html.length) {
    parts.push({ type: 'html', content: html.slice(cursor) });
  }

  return parts;
};

const convertHtmlChunk = async (naverApi, html) => {
  if (!String(html || '').trim()) return [];
  const apiComponents = await naverApi.convertHtmlToComponents(html);
  if (Array.isArray(apiComponents) && apiComponents.length > 0) return apiComponents;
  return parseHtmlToComponents(html, []);
};

/**
 * Converts HTML to an array of Naver editor components.
 * Primary: Naver API (upconvert.editor.naver.com)
 * Fallback: Custom parsing.
 *
 * Use <!-- VIRU_IMAGE:1 --> markers to place uploaded images at exact positions.
 * Marker indices are 1-based and follow the --image-file/--image-urls input order.
 * Without markers, uploaded images keep the legacy behavior and appear before the body.
 */
const convertHtmlToEditorComponents = async (naverApi, html, imageComponents = []) => {
  const slots = Array.isArray(imageComponents) ? imageComponents : [];
  const activeImages = slots.filter(Boolean);
  const parts = splitHtmlWithImageMarkers(html);
  const hasMarkers = parts.some((part) => part.type === 'image');

  if (!hasMarkers) {
    const contentComponents = await convertHtmlChunk(naverApi, html);
    return [...activeImages, ...contentComponents];
  }

  const result = [];
  const used = new Set();

  for (const part of parts) {
    if (part.type === 'html') {
      result.push(...await convertHtmlChunk(naverApi, part.content));
      continue;
    }

    if (!Number.isInteger(part.index) || part.index < 0 || part.index >= slots.length) {
      throw new Error(`Naver image marker VIRU_IMAGE:${part.index + 1} is out of range (uploaded slots: ${slots.length}).`);
    }
    if (used.has(part.index)) {
      throw new Error(`Naver image marker VIRU_IMAGE:${part.index + 1} is duplicated.`);
    }
    if (!slots[part.index]) {
      throw new Error(`Naver image marker VIRU_IMAGE:${part.index + 1} refers to an image that failed to upload.`);
    }

    result.push(slots[part.index]);
    used.add(part.index);
  }

  slots.forEach((component, index) => {
    if (component && !used.has(index)) result.push(component);
  });

  return result;
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
  splitHtmlWithImageMarkers,
  seId,
};
