#!/usr/bin/env node
/**
 * Blog Analyzer Server
 * - 뷰어 서빙 + 분석 API + SSE 실시간 로그
 *
 * Usage: node server.js [--port 8787]
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { runAnalysis } = require('./analyze');

const PORT = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--port') || '8787', 10);
const RESULTS_DIR = path.join(__dirname, 'results');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// 현재 실행 중인 분석 작업
let runningJob = null;

function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── API: 결과 목록 ──
  if (pathname === '/api/results' && req.method === 'GET') {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    const files = fs.readdirSync(RESULTS_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse();
    return json(res, 200, { files });
  }

  // ── API: 결과 읽기 ──
  if (pathname.startsWith('/api/results/') && req.method === 'GET') {
    const filename = path.basename(pathname);
    const filePath = path.join(RESULTS_DIR, filename);
    if (!fs.existsSync(filePath)) return json(res, 404, { error: 'Not found' });
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return json(res, 200, data);
  }

  // ── API: 결과 삭제 ──
  if (pathname.startsWith('/api/results/') && req.method === 'DELETE') {
    const filename = path.basename(pathname);
    const filePath = path.join(RESULTS_DIR, filename);
    if (!fs.existsSync(filePath)) return json(res, 404, { error: 'Not found' });
    fs.unlinkSync(filePath);
    return json(res, 200, { deleted: filename });
  }

  // ── API: 분석 시작 (SSE) ──
  if (pathname === '/api/analyze' && req.method === 'POST') {
    let body;
    try { body = await readBody(req); }
    catch { return json(res, 400, { error: 'Invalid JSON' }); }

    const { keyword, provider = 'naver', top = 5 } = body;
    if (!keyword) return json(res, 400, { error: 'keyword is required' });

    if (runningJob) {
      return json(res, 409, { error: '이미 분석이 진행 중입니다.' });
    }

    // SSE 헤더
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const sendEvent = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    runningJob = { keyword, provider, top };
    sendEvent('log', { message: `분석 시작: "${keyword}" (${provider}, 상위 ${top}개)` });

    try {
      const { filename, data } = await runAnalysis({
        keyword,
        provider,
        top,
        onLog: (msg) => sendEvent('log', { message: msg }),
      });

      sendEvent('done', { filename, data });
    } catch (err) {
      sendEvent('error', { message: err.message });
    } finally {
      runningJob = null;
      res.end();
    }
    return;
  }

  // ── API: 상태 ──
  if (pathname === '/api/status') {
    return json(res, 200, { running: !!runningJob, job: runningJob });
  }

  // ── 정적 파일 서빙 ──
  if (pathname === '/' || pathname === '/index.html') {
    return serveStatic(res, path.join(__dirname, 'viewer.html'));
  }

  // results/ 디렉토리
  if (pathname.startsWith('/results/')) {
    const filePath = path.join(__dirname, pathname);
    return serveStatic(res, filePath);
  }

  // 기타 정적 파일
  const filePath = path.join(__dirname, pathname);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return serveStatic(res, filePath);
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n  블로그 분석 서버 시작`);
  console.log(`  http://localhost:${PORT}\n`);
});
