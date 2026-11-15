// ClipForge local server (Node.js, built-in modules only).
// Serves the app/ folder next to this file on 127.0.0.1 only. Port: CLIPFORGE_PORT (default 8123).
// Content types come from the table below, not from the operating system.
import { createServer, get } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(join(dirname(fileURLToPath(import.meta.url)), 'app'));
const port = Number(process.env.CLIPFORGE_PORT) || 8123;

// --check: exit 0 only if a ClipForge server answers on the port (used by the launchers before opening the browser).
if (process.argv.includes('--check')) {
  get({ host: '127.0.0.1', port, timeout: 1000 }, (r) => process.exit(r.headers['x-clipforge'] === '1' ? 0 : 1)).on('error', () => process.exit(1));
  await new Promise(() => {});
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const isFile = async (p) => (await stat(p).catch(() => null))?.isFile() ?? false;
const isDir = async (p) => (await stat(p).catch(() => null))?.isDirectory() ?? false;

function send(res, status, body, type, head) {
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': 'no-cache', 'X-ClipForge': '1' });
  res.end(head ? undefined : body);
}

const server = createServer(async (req, res) => {
  const head = req.method === 'HEAD';
  try {
    if (req.method !== 'GET' && !head) return send(res, 405, Buffer.from('Method not allowed'), 'text/plain; charset=utf-8', head);
    let path;
    try {
      path = decodeURIComponent((req.url ?? '/').split('?')[0].split('#')[0]);
    } catch {
      return send(res, 400, Buffer.from('Bad request'), 'text/plain; charset=utf-8', head);
    }
    const parts = path.replace(/\\/g, '/').split('/');
    if (parts.includes('..') || path.includes('\0')) return send(res, 403, Buffer.from('Forbidden'), 'text/plain; charset=utf-8', head);
    let target = join(root, ...parts.filter(Boolean));
    target = await realpath(target).catch(() => target);
    if (target !== root && !target.startsWith(root + sep)) return send(res, 403, Buffer.from('Forbidden'), 'text/plain; charset=utf-8', head);
    if (await isDir(target)) target = join(target, 'index.html');
    if (!(await isFile(target))) {
      if (parts[parts.length - 1].includes('.')) return send(res, 404, Buffer.from('Not found'), 'text/plain; charset=utf-8', head); // missing asset
      target = join(root, 'index.html'); // app route
    }
    send(res, 200, await readFile(target), TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream', head);
  } catch {
    send(res, 500, Buffer.from('Server error'), 'text/plain; charset=utf-8', head);
  }
});

server.on('error', (e) => {
  console.error(`Could not start ClipForge on port ${port} (${e.message}). Close the other program using it, or set CLIPFORGE_PORT.`);
  process.exit(1);
});
server.listen(port, '127.0.0.1', () => {
  console.log(`ClipForge is running at http://localhost:${port} — close this window to stop it`);
});
