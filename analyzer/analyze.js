#!/usr/bin/env node
/**
 * Blog Post Analyzer - 네이버/티스토리 상위 블로그 구조 분석 스크립트
 *
 * Usage:
 *   node analyze.js --keyword "키워드" --provider naver|tistory --top 5
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, 'results');

// ─── CLI 파싱 ───
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { keyword: '', provider: 'naver', top: 5 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--keyword' && args[i + 1]) opts.keyword = args[++i];
    if (args[i] === '--provider' && args[i + 1]) opts.provider = args[++i];
    if (args[i] === '--top' && args[i + 1]) opts.top = parseInt(args[++i], 10);
  }
  if (!opts.keyword) {
    console.error('Usage: node analyze.js --keyword "키워드" [--provider naver|tistory] [--top 5]');
    process.exit(1);
  }
  return opts;
}

// ─── 네이버 블로그 검색 ───
async function searchNaver(page, keyword, topN) {
  const url = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}`;
  console.log(`[검색] ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  // 블로그 검색 결과에서 링크 수집 (SDS 컴포넌트 기반 UI)
  const links = await page.evaluate((n) => {
    const results = [];
    const seen = new Set();
    // blog.naver.com/<user>/<postId> 패턴의 링크를 찾아 제목 텍스트가 있는 것만 수집
    document.querySelectorAll('a[href*="blog.naver.com"]').forEach((a) => {
      if (results.length >= n) return;
      const href = a.getAttribute('href');
      // 포스트 URL 패턴: /username/숫자
      if (!href || !href.match(/blog\.naver\.com\/\w+\/\d+/)) return;
      if (seen.has(href)) return;
      const title = a.textContent.trim();
      // 제목다운 텍스트만 (10~200자)
      if (title.length >= 10 && title.length <= 200) {
        seen.add(href);
        results.push({ title, url: href });
      }
    });
    return results;
  }, topN);

  console.log(`[검색] ${links.length}개 포스트 발견`);
  return links;
}

// ─── 티스토리 블로그 검색 (다음 검색) ───
async function searchTistory(page, keyword, topN) {
  const url = `https://search.daum.net/search?w=blog&q=${encodeURIComponent(keyword + ' site:tistory.com')}`;
  console.log(`[검색] ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  const links = await page.evaluate((n) => {
    const results = [];
    const items = document.querySelectorAll('.c-title-doc a, .wrap_tit a');
    for (const item of items) {
      if (results.length >= n) break;
      const href = item.getAttribute('href');
      const title = item.textContent.trim();
      if (href && href.includes('tistory.com')) {
        results.push({ title, url: href });
      }
    }
    return results;
  }, topN);

  console.log(`[검색] ${links.length}개 포스트 발견`);
  return links;
}

// ─── 네이버 블로그 포스트 콘텐츠 추출 ───
async function extractNaverPost(page, postUrl) {
  console.log(`[추출] ${postUrl}`);
  await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  // 네이버 블로그는 iframe 내부에 콘텐츠가 있을 수 있음
  let contentFrame = page;
  try {
    const iframe = await page.$('iframe#mainFrame');
    if (iframe) {
      contentFrame = await iframe.contentFrame();
      await contentFrame.waitForTimeout(1500);
    }
  } catch { /* iframe 없으면 메인 페이지에서 추출 */ }

  return contentFrame.evaluate(() => {
    const container = document.querySelector(
      '.se-main-container, .post-view, .se_component_wrap, #postViewArea, .post_ct'
    );
    if (!container) return null;

    const html = container.innerHTML;
    const text = container.textContent.trim();

    // SE에디터 컴포넌트 순서 기반 구조 분석
    const componentFlow = [];
    const headings = [];
    const paragraphs = [];

    container.querySelectorAll('.se-component').forEach((comp) => {
      const cls = comp.className;
      const typeMatch = cls.match(/se-(image|text|sticker|oglink|quotation|horizontalLine|table|map|code)/);
      const type = typeMatch ? typeMatch[1] : null;
      if (!type) return;

      if (type === 'quotation') {
        // 인용 블록 = 소제목 역할
        const t = comp.textContent.trim();
        if (t.length > 1 && t.length < 100) {
          headings.push({ tag: 'QUOTATION', text: t });
          componentFlow.push({ type: 'heading', text: t });
        }
      } else if (type === 'text') {
        const p = comp.querySelector('.se-text-paragraph');
        if (!p) return;
        const t = p.textContent.trim();
        const isCenter = p.className.includes('align-center');
        const hasBold = p.querySelector('b, strong') !== null;

        // 중앙정렬 볼드 텍스트 = 소제목 역할
        if (isCenter && hasBold && t.length > 1 && t.length < 100) {
          headings.push({ tag: 'BOLD_CENTER', text: t });
          componentFlow.push({ type: 'heading', text: t });
        } else if (t.length > 10) {
          paragraphs.push(t);
          componentFlow.push({ type: 'paragraph', length: t.length });
        }
      } else if (type === 'image') {
        componentFlow.push({ type: 'image' });
      } else if (type === 'table') {
        componentFlow.push({ type: 'table' });
      } else if (type === 'sticker') {
        componentFlow.push({ type: 'sticker' });
      } else if (type === 'oglink') {
        componentFlow.push({ type: 'link_card' });
      }
    });

    // h2/h3 태그도 체크 (SE에디터 외 포맷)
    container.querySelectorAll('h2, h3').forEach((h) => {
      const t = h.textContent.trim();
      if (t.length > 1 && t.length < 100) {
        headings.push({ tag: h.tagName, text: t });
      }
    });

    const images = container.querySelectorAll('img').length;
    const lists = container.querySelectorAll('ul, ol').length;
    const tables = container.querySelectorAll('table').length;
    const bolds = container.querySelectorAll('b, strong').length;
    const links = container.querySelectorAll('a[href]').length;
    const quotes = container.querySelectorAll('.se-quotation, blockquote').length;

    return {
      html,
      text,
      headings,
      paragraphs,
      componentFlow,
      imageCount: images,
      listCount: lists,
      tableCount: tables,
      boldCount: bolds,
      linkCount: links,
      quoteCount: quotes,
      charCount: text.length,
      wordCount: text.replace(/\s+/g, ' ').split(' ').length,
    };
  });
}

// ─── 티스토리 블로그 포스트 콘텐츠 추출 ───
async function extractTistoryPost(page, postUrl) {
  console.log(`[추출] ${postUrl}`);
  await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  return page.evaluate(() => {
    const container = document.querySelector(
      '.entry-content, .article-view, .tt_article_useless_p_margin, #article-view, .contents_style, .post-content, article'
    );
    if (!container) return null;

    const html = container.innerHTML;
    const text = container.textContent.trim();

    const headings = [];
    container.querySelectorAll('h2, h3, h4').forEach((h) => {
      const t = h.textContent.trim();
      if (t.length > 1 && t.length < 100) {
        headings.push({ tag: h.tagName, text: t });
      }
    });

    const paragraphs = [];
    container.querySelectorAll('p').forEach((p) => {
      const t = p.textContent.trim();
      if (t.length > 10) paragraphs.push(t);
    });

    const images = container.querySelectorAll('img').length;
    const lists = container.querySelectorAll('ul, ol').length;
    const tables = container.querySelectorAll('table').length;
    const bolds = container.querySelectorAll('b, strong').length;
    const links = container.querySelectorAll('a[href]').length;
    const quotes = container.querySelectorAll('blockquote').length;

    return {
      html,
      text,
      headings,
      paragraphs,
      imageCount: images,
      listCount: lists,
      tableCount: tables,
      boldCount: bolds,
      linkCount: links,
      quoteCount: quotes,
      charCount: text.length,
      wordCount: text.replace(/\s+/g, ' ').split(' ').length,
    };
  });
}

// ─── 패턴 분석 ───
function analyzePatterns(posts) {
  const valid = posts.filter((p) => p.content);
  if (valid.length === 0) return null;

  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const round = (n) => Math.round(n * 10) / 10;

  // 기본 통계
  const stats = {
    postCount: valid.length,
    avgCharCount: round(avg(valid.map((p) => p.content.charCount))),
    avgWordCount: round(avg(valid.map((p) => p.content.wordCount))),
    avgHeadingCount: round(avg(valid.map((p) => p.content.headings.length))),
    avgImageCount: round(avg(valid.map((p) => p.content.imageCount))),
    avgParagraphCount: round(avg(valid.map((p) => p.content.paragraphs.length))),
    avgListCount: round(avg(valid.map((p) => p.content.listCount))),
    avgTableCount: round(avg(valid.map((p) => p.content.tableCount))),
    avgBoldCount: round(avg(valid.map((p) => p.content.boldCount))),
    avgLinkCount: round(avg(valid.map((p) => p.content.linkCount))),
    avgQuoteCount: round(avg(valid.map((p) => p.content.quoteCount))),
  };

  // 컴포넌트 흐름 기반 구조 패턴 추출
  const structurePatterns = valid.map((p) => {
    const content = p.content;
    const flow = content.componentFlow || [];
    const sections = [];

    // 도입부 판단 (첫 문단)
    if (content.paragraphs.length > 0) {
      const intro = content.paragraphs[0];
      if (intro.includes('?')) sections.push('질문형_도입');
      else if (intro.length < 100) sections.push('짧은_도입');
      else sections.push('서술형_도입');
    }

    // 컴포넌트 흐름 요약 (연속 동일 타입 압축)
    let prevType = null;
    let groupCount = 0;
    for (const comp of flow) {
      if (comp.type === prevType) {
        groupCount++;
        continue;
      }
      if (prevType && groupCount > 1) {
        sections.push(`${prevType}x${groupCount}`);
      } else if (prevType) {
        sections.push(prevType);
      }
      prevType = comp.type;
      groupCount = 1;
    }
    if (prevType && groupCount > 1) sections.push(`${prevType}x${groupCount}`);
    else if (prevType) sections.push(prevType);

    // 이미지 밀도
    if (content.imageCount === 0) sections.push('이미지_없음');
    else if (content.imageCount <= 3) sections.push('이미지_적음');
    else if (content.imageCount <= 7) sections.push('이미지_보통');
    else sections.push('이미지_많음');

    // 마무리 패턴
    if (content.paragraphs.length > 0) {
      const outro = content.paragraphs[content.paragraphs.length - 1];
      if (outro.includes('?')) sections.push('질문형_마무리');
      else if (outro.includes('감사') || outro.includes('도움')) sections.push('감사형_마무리');
      else sections.push('서술형_마무리');
    }

    return sections;
  });

  // 소제목 키워드 빈도
  const headingKeywords = {};
  valid.forEach((p) => {
    p.content.headings.forEach((h) => {
      const words = h.text.split(/\s+/);
      words.forEach((w) => {
        if (w.length >= 2) {
          headingKeywords[w] = (headingKeywords[w] || 0) + 1;
        }
      });
    });
  });
  const topHeadingKeywords = Object.entries(headingKeywords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({ word, count }));

  // 문단 길이 분포
  const allParagraphLengths = valid.flatMap((p) => p.content.paragraphs.map((t) => t.length));
  const paragraphLengthDistribution = {
    short: allParagraphLengths.filter((l) => l < 50).length,
    medium: allParagraphLengths.filter((l) => l >= 50 && l < 150).length,
    long: allParagraphLengths.filter((l) => l >= 150 && l < 300).length,
    veryLong: allParagraphLengths.filter((l) => l >= 300).length,
  };

  return {
    stats,
    structurePatterns,
    topHeadingKeywords,
    paragraphLengthDistribution,
    avgParagraphLength: allParagraphLengths.length > 0
      ? round(avg(allParagraphLengths))
      : 0,
  };
}

// ─── 분석 실행 (모듈용) ───
async function runAnalysis({ keyword, provider = 'naver', top = 5, onLog = console.log }) {
  onLog(`[시작] 키워드: "${keyword}" | 플랫폼: ${provider} | 상위 ${top}개`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'ko-KR',
  });
  const page = await context.newPage();

  try {
    // 1. 검색
    let searchResults;
    if (provider === 'naver') {
      searchResults = await searchNaver(page, keyword, top);
    } else {
      searchResults = await searchTistory(page, keyword, top);
    }
    onLog(`[검색 완료] ${searchResults.length}개 발견`);

    if (searchResults.length === 0) {
      throw new Error('검색 결과가 없습니다.');
    }

    // 2. 각 포스트 콘텐츠 추출
    const posts = [];
    for (let i = 0; i < searchResults.length; i++) {
      const result = searchResults[i];
      onLog(`[추출 ${i + 1}/${searchResults.length}] ${result.title.substring(0, 50)}...`);
      try {
        let content;
        if (provider === 'naver') {
          content = await extractNaverPost(page, result.url);
        } else {
          content = await extractTistoryPost(page, result.url);
        }
        posts.push({ ...result, content });
        if (content) {
          onLog(`  ✓ ${content.charCount}자, H:${content.headings.length}, IMG:${content.imageCount}`);
        } else {
          onLog(`  ✗ 추출 실패`);
        }
      } catch (err) {
        onLog(`  ✗ ${err.message}`);
        posts.push({ ...result, content: null });
      }
    }

    // 3. 패턴 분석
    onLog(`[분석] 패턴 추출 중...`);
    const patterns = analyzePatterns(posts);

    // 4. 결과 저장
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const filename = `${provider}-${keyword.replace(/\s+/g, '_')}-${timestamp}.json`;
    const outputPath = path.join(RESULTS_DIR, filename);

    const resultData = {
      meta: {
        keyword,
        provider,
        analyzedAt: new Date().toISOString(),
        topN: top,
        successCount: posts.filter((p) => p.content).length,
      },
      patterns,
      posts: posts.map((p) => ({
        title: p.title,
        url: p.url,
        content: p.content ? {
          charCount: p.content.charCount,
          wordCount: p.content.wordCount,
          headings: p.content.headings,
          componentFlow: p.content.componentFlow || [],
          imageCount: p.content.imageCount,
          paragraphCount: p.content.paragraphs.length,
          listCount: p.content.listCount,
          tableCount: p.content.tableCount,
          boldCount: p.content.boldCount,
          linkCount: p.content.linkCount,
          quoteCount: p.content.quoteCount,
          paragraphs: p.content.paragraphs.slice(0, 3),
        } : null,
      })),
    };

    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(resultData, null, 2), 'utf-8');
    onLog(`[완료] 저장: ${filename}`);

    return { filename, data: resultData };
  } finally {
    await browser.close();
  }
}

module.exports = { runAnalysis };

// ─── CLI 모드 ───
if (require.main === module) {
  const opts = parseArgs();
  runAnalysis({
    keyword: opts.keyword,
    provider: opts.provider,
    top: opts.top,
  })
    .then(({ data }) => {
      const s = data.patterns?.stats;
      if (s) {
        console.log(`\n--- 요약 ---`);
        console.log(`분석 포스트: ${s.postCount}개`);
        console.log(`평균 글자수: ${s.avgCharCount}`);
        console.log(`평균 소제목: ${s.avgHeadingCount}개`);
        console.log(`평균 이미지: ${s.avgImageCount}개`);
      }
    })
    .catch((err) => {
      console.error('[치명적 오류]', err.message);
      process.exit(1);
    });
}
