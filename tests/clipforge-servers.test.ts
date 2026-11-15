import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildZip } from '../scripts/package-clipforge.mjs';

// The two zero-dependency servers shipped in the buyer zip, run against the real built app from the zip.
const work = mkdtempSync(join(tmpdir(), 'clipforge-servers-'));
let dir = '';
let jsAsset = '';

const freePort = () =>
  new Promise<number>((ok) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => ok(port));
    });
  });

/** Raw request so the path is sent exactly as given (fetch would normalise "/../"). */
const get = (port: number, path: string, host = '127.0.0.1') =>
  new Promise<{ status: number; type: string; body: string }>((ok, fail) => {
    const req = request({ host, port, path, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => ok({ status: res.statusCode ?? 0, type: String(res.headers['content-type'] ?? ''), body }));
    });
    req.on('error', fail);
    req.end();
  });

beforeAll(async () => {
  const zip = await buildZip({ version: '1.0.0', out: work });
  dir = join(work, 'unzipped');
  execFileSync('unzip', ['-q', zip, '-d', dir]);
  writeFileSync(join(dir, 'app', 'probe.wasm'), Buffer.from([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]));
  jsAsset = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').find((n) => /^app\/assets\/.*\.js$/.test(n))!.slice(4);
}, 300_000);

afterAll(() => rmSync(work, { recursive: true, force: true }));

const servers: [string, string, string[]][] = [
  ['serve.py (Python)', 'python3', ['serve.py']],
  ['serve.mjs (Node)', process.execPath, ['serve.mjs']],
];

describe.each(servers)('%s', (_name, cmd, args) => {
  let child: ChildProcess;
  let port = 0;
  let output = '';

  beforeAll(async () => {
    port = await freePort();
    child = spawn(cmd, args, { cwd: dir, env: { ...process.env, CLIPFORGE_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout!.on('data', (c) => (output += c));
    for (let i = 0; i < 100 && !output.includes('ClipForge is running'); i++) await new Promise((r) => setTimeout(r, 50));
  });
  afterAll(() => child?.kill());

  it('announces itself', () => {
    expect(output).toContain(`ClipForge is running at http://localhost:${port}`);
    expect(output).toContain('close this window to stop it');
  });

  it('sends explicit content types: text/javascript for .js, application/wasm for .wasm, text/css for .css', async () => {
    expect((await get(port, `/${jsAsset}`)).type).toMatch(/^text\/javascript/);
    expect((await get(port, '/probe.wasm')).type).toBe('application/wasm');
    const css = execFileSync('unzip', ['-Z1', join(work, 'ClipForge-1.0.0.zip')], { encoding: 'utf8' }).split('\n').find((n) => n.endsWith('.css'))!;
    expect((await get(port, `/${css.slice(4)}`)).type).toMatch(/^text\/css/);
    expect((await get(port, '/')).type).toMatch(/^text\/html/);
  });

  it('listens on 127.0.0.1 only', async () => {
    const external = Object.values(networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal);
    if (external) await expect(get(port, '/', external.address)).rejects.toThrow(/ECONNREFUSED/);
    const tcp = readFileSync('/proc/net/tcp', 'utf8').split('\n');
    const mine = tcp.filter((l) => l.includes(`:${port.toString(16).toUpperCase().padStart(4, '0')} `) && /\s0A\s/.test(l));
    expect(mine.length).toBeGreaterThan(0);
    for (const l of mine) expect(l.trim().split(/\s+/)[1]).toBe(`0100007F:${port.toString(16).toUpperCase().padStart(4, '0')}`);
  });

  it('refuses path traversal', async () => {
    for (const p of ['/../package.json', '/assets/../../package.json', '/%2e%2e/package.json', '/..%2f..%2fetc/passwd', '/..\\package.json']) {
      const r = await get(port, p);
      expect([403, 404], p).toContain(r.status);
      expect(r.body).not.toContain('"scripts"');
    }
  });

  it('falls back to index.html for unknown routes but 404s a missing asset', async () => {
    const index = (await get(port, '/')).body;
    expect(index).toContain('<title>');
    const route = await get(port, '/some/unknown/route');
    expect(route.status).toBe(200);
    expect(route.body).toBe(index);
    expect((await get(port, '/assets/missing-file.js')).status).toBe(404);
  });
});
