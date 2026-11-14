// ClipForge local server: serves the built app from ./app on http://localhost:PORT with no dependencies.
// The port is fixed on purpose: browser storage (your projects and media) belongs to the address, so a different port would look empty.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = resolve(fileURLToPath(new URL('./app', import.meta.url)));
const port = Number(process.env.PORT) || 5173;
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json',
};
const baseHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(self), geolocation=()',
};

async function find(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^([/\\])+/, '');
  const file = resolve(join(root, clean));
  if (file !== root && !file.startsWith(root + sep)) return null;
  try {
    const s = await stat(file);
    if (s.isDirectory()) return find(join(urlPath, 'index.html'));
    return file;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    let file = await find(req.url || '/');
    // Single-page app: unknown paths (but not missing assets) get the app shell.
    if (!file && !(req.url || '').startsWith('/assets/')) file = join(root, 'index.html');
    if (!file) { res.writeHead(404, baseHeaders).end('Not found'); return; }
    const body = await readFile(file);
    res.writeHead(200, { ...baseHeaders, 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(500, baseHeaders).end('Server error');
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\nPort ${port} is already in use. ClipForge may already be running: open http://localhost:${port}\n` +
      'If something else uses that port, close it and start ClipForge again (do not change the port: your projects are stored per address).');
  } else console.error(e);
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  const url = `http://localhost:${port}`;
  console.log(`\nClipForge is running at ${url}\nKeep this window open while you edit. Press Ctrl+C to stop.\n`);
  if (process.env.NO_OPEN) return;
  const cmd = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch { /* open the address by hand */ }
});
