// Starts WordPress Playground (Node only, no Docker) at http://localhost:8888
// with WooCommerce, the ideatoapps theme and the ideatoapps-core plugin mounted.
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrap } from './wp-bootstrap.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.WP_PORT || '8888';
const core = bootstrap();
const args = [
  'wp-playground-cli', 'server',
  '--port', port,
  '--site-url', `http://localhost:${port}`,
  '--mount-before-install', `${core}:/wordpress`,
  '--wordpress-install-mode', 'install-from-existing-files-if-needed',
  '--blueprint', resolve(root, 'blueprint.json'),
  '--mount', `${resolve(root, 'wp-content/themes/ideatoapps')}:/wordpress/wp-content/themes/ideatoapps`,
  '--mount', `${resolve(root, 'wp-content/plugins/ideatoapps-core')}:/wordpress/wp-content/plugins/ideatoapps-core`,
];
const child = spawn('npx', args, { cwd: root, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => child.kill(s));
