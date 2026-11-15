// Fetches WordPress core (via Composer/Packagist, git transport) and WooCommerce (GitHub release asset)
// into site/.wp/. Needed because wordpress.org and wp-now.com are not reachable from the sandbox.
// Idempotent: does nothing when .wp/wordpress and the WooCommerce plugin already exist.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, cpSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cache = resolve(root, '.wp');
const core = resolve(cache, 'wordpress');
const WP_CORE = process.env.WP_CORE_VERSION || '^7.1';
const WC_VERSION = process.env.WC_VERSION || '11.3.0';
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts });

export function bootstrap() {
  mkdirSync(cache, { recursive: true });
  if (!existsSync(resolve(core, 'wp-load.php'))) {
    const tmp = resolve(cache, 'composer');
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    writeFileSync(resolve(tmp, 'composer.json'), JSON.stringify({ require: { 'johnpbloch/wordpress-core': WP_CORE }, config: { 'allow-plugins': true } }));
    run('composer', ['install', '--no-interaction', '--no-progress'], { cwd: tmp });
    cpSync(resolve(tmp, 'vendor/johnpbloch/wordpress-core'), core, { recursive: true });
    rmSync(tmp, { recursive: true, force: true });
  }
  const wc = resolve(core, 'wp-content/plugins/woocommerce');
  if (!existsSync(resolve(wc, 'woocommerce.php'))) {
    const zip = resolve(cache, `woocommerce-${WC_VERSION}.zip`);
    run('curl', ['-fsSL', '-o', zip, `https://github.com/woocommerce/woocommerce/releases/download/${WC_VERSION}/woocommerce.zip`]);
    run('unzip', ['-q', '-o', zip, '-d', resolve(core, 'wp-content/plugins')]);
  }
  return core;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) bootstrap();
