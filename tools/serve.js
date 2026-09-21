// tools/serve.js — zero-dependency static dev server (Node ≥ 18).
// Replaces `python3 -m http.server`, which does not exist on stock Windows.
//
//   npm run serve            # http://localhost:8080
//   npm run serve -- 3000    # http://localhost:3000
//   PORT=3000 npm run serve
import http from 'node:http';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.argv[2] || process.env.PORT || 8080);

// ES modules must be served as JavaScript or browsers refuse to execute them.
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.wasm': 'application/wasm',
};

const typeFor = (file) => MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';

// Resolve a request URL to a path inside ROOT, or null if it escapes.
function resolveUrl(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const rel = decoded.replace(/^[\\/]+/, '');
  const abs = path.resolve(ROOT, rel);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null;
  return abs;
}

function send(res, req, status, headers, body) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    ...headers,
  });
  if (req.method === 'HEAD' || body == null) return res.end();
  return res.end(body);
}

// Write headers only — the caller streams the body (used for GET on real files).
function sendHead(res, status, headers) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    ...headers,
  });
}

function notFound(res, req, target) {
  const html = `<!doctype html><meta charset="utf-8"><title>404</title>
<body style="background:#14110d;color:#cfc6b8;font:16px/1.6 Georgia,serif;padding:3rem">
<h1 style="font-weight:400;color:#d8b36a">404 — nothing here</h1>
<p><code style="color:#8f887c">${target}</code></p>
<p><a href="/" style="color:#d8b36a">Back to THE LONG QUIET</a></p>`;
  send(res, req, 404, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(html) }, html);
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const urlPath = (req.url || '/').split('?')[0].split('#')[0];

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, req, 405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' }, '405 Method Not Allowed');
    return log(req, urlPath, 405, started);
  }

  const file = resolveUrl(urlPath);
  if (!file) { notFound(res, req, urlPath); return log(req, urlPath, 404, started); }

  try {
    let target = file;
    let stat = await fs.stat(target);
    if (stat.isDirectory()) {
      target = path.join(target, 'index.html');
      stat = await fs.stat(target);
    }
    const headers = {
      'Content-Type': typeFor(target),
      'Content-Length': stat.size,
      'Last-Modified': stat.mtime.toUTCString(),
    };
    if (req.method === 'HEAD') {
      send(res, req, 200, headers);
      return log(req, urlPath, 200, started);
    }
    sendHead(res, 200, headers);
    createReadStream(target)
      .on('error', () => { res.destroy(); log(req, urlPath, 500, started); })
      .pipe(res)
      .on('finish', () => log(req, urlPath, 200, started));
  } catch {
    notFound(res, req, urlPath);
    log(req, urlPath, 404, started);
  }
});

function log(req, urlPath, status, started) {
  const mark = status < 400 ? '\x1b[32m' : '\x1b[33m';
  console.log(`${mark}${status}\x1b[0m ${req.method} ${urlPath} \x1b[90m${Date.now() - started}ms\x1b[0m`);
}

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n✗ Port ${PORT} is already in use.`);
    console.error(`  Try another one:  npm run serve -- ${PORT + 1}\n`);
  } else {
    console.error('\n✗ ' + e.message + '\n');
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' || HOST === '::' ? 'localhost' : HOST;
  console.log(`\n  THE LONG QUIET — dev server`);
  console.log(`  \x1b[36mhttp://${shown}:${PORT}\x1b[0m  (serving ${ROOT})`);
  console.log(`  Ctrl+C to stop\n`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 300); });
}
