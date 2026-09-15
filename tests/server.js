// tests/server.js — zero-dependency static server for the test harness.
//
// The suite must run after a plain `npm install` and nothing else: no bundler, no
// build step, no dev-server framework. Node's http module plus a MIME table is
// enough — and it gives the specs a real origin, which file:// pages cannot
// provide for ES modules.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = Number(process.argv[2] || 8817);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = path.resolve(ROOT, rel);

  // Keep every request inside the repo root.
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  fs.readFile(file, (error, data) => {
    if (error) {
      // A real 404 matters: rasterize.spec.js relies on one to prove that an
      // unfetchable image is hidden instead of painted as a broken frame.
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    }).end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`share-kit harness: http://127.0.0.1:${PORT}/tests/harness.html`);
});
