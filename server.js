// Smart Pet Feeder - web dashboard + simulated device API
// Run: node server.js  ->  http://localhost:3000
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createDevice } = require('./public/device-core');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const device = createDevice();

function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', c => (data += c));
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
  });
}

const TYPES = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Lets the test runner stop the server quickly after a run (Windows process kill is slow).
  if (req.method === 'POST' && url.pathname === '/api/sim/shutdown') {
    send(res, 200, { status: 'SHUTTING_DOWN' });
    return setTimeout(() => process.exit(0), 100);
  }

  if (url.pathname.startsWith('/api/')) {
    const [code, payload] = device.handle(req.method, url.pathname, await readBody(req));
    return send(res, code, payload);
  }

  // Static files
  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const full = path.join(PUBLIC_DIR, path.normalize(file));
  if (!full.startsWith(PUBLIC_DIR)) return send(res, 403, {});
  fs.readFile(full, (err, data) => {
    if (err) return send(res, 404, { status: 'NOT_FOUND' });
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'text/plain' });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`Smart Pet Feeder running at http://localhost:${PORT}`));
