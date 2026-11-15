import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildZip } from '../scripts/package-clipforge.mjs';

// The unix launchers must open the browser only once the server answers, and never when it failed to start.
const work = mkdtempSync(join(tmpdir(), 'clipforge-launcher-'));
let dir = '';
let seq = 0;

beforeAll(async () => {
  const zip = await buildZip({ version: '1.0.0', out: work });
  dir = join(work, 'unzipped');
  execFileSync('unzip', ['-q', zip, '-d', dir]);
}, 300_000);
afterAll(() => rmSync(work, { recursive: true, force: true }));

const freePort = () =>
  new Promise<number>((ok) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => ok(port));
    });
  });

/** A bin dir whose opener records its arguments; `nodeOnly` also hides Python so the launcher must use node. */
function fakeBin(opener: string, nodeOnly: boolean) {
  const bin = join(work, `bin-${seq++}`);
  mkdirSync(bin);
  const record = join(bin, 'opened.log');
  writeFileSync(join(bin, opener), `#!/bin/sh\necho "$1" >> "${record}"\n`);
  chmodSync(join(bin, opener), 0o755);
  if (nodeOnly) {
    symlinkSync(process.execPath, join(bin, 'node'));
    for (const t of ['sleep']) symlinkSync(execFileSync('which', [t], { encoding: 'utf8' }).trim(), join(bin, t));
  }
  return { bin, record, path: nodeOnly ? bin : `${bin}${delimiter}${process.env.PATH}` };
}

const env = (port: number, path: string) => {
  const e: NodeJS.ProcessEnv = { ...process.env, PATH: path, CLIPFORGE_PORT: String(port) };
  delete e.CLIPFORGE_NO_OPEN;
  return e;
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.each([
  ['start-linux.sh', 'xdg-open'],
  ['start-mac.command', 'open'],
])('%s', (launcher, opener) => {
  it('port already in use: prints the message, exits non-zero and never opens the browser', async () => {
    const port = await freePort();
    const squatter: Server = createServer((s) => s.end('HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n')).listen(port, '127.0.0.1');
    await new Promise((r) => squatter.once('listening', r));
    try {
      const fake = fakeBin(opener, false);
      const r = spawnSync(join(dir, launcher), [], { encoding: 'utf8', timeout: 30_000, env: env(port, fake.path) });
      expect(r.status).not.toBe(0);
      expect(`${r.stdout}${r.stderr}`).toContain(`ClipForge could not start. Is another program using port ${port}?`);
      await wait(1500); // a stray backgrounded opener would have fired by now
      expect(existsSync(fake.record)).toBe(false);
    } finally {
      squatter.close();
    }
  });

  it.each([
    ['python', false],
    ['node', true],
  ])('normal start (%s): opens the browser exactly once with the URL', async (_name, nodeOnly) => {
    const port = await freePort();
    const fake = fakeBin(opener, nodeOnly);
    const child = spawn(join(dir, launcher), [], { detached: true, stdio: 'ignore', env: env(port, fake.path) });
    try {
      for (let i = 0; i < 100 && !existsSync(fake.record); i++) await wait(100);
      await wait(1000);
      expect(readFileSync(fake.record, 'utf8')).toBe(`http://localhost:${port}\n`);
    } finally {
      try {
        process.kill(-child.pid!, 'SIGTERM');
      } catch {
        /* gone */
      }
    }
  });
});
