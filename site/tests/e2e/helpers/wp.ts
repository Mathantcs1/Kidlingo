import { request, expect, type APIRequestContext } from '@playwright/test';

/**
 * Test-side WordPress fixtures: log in as the sandbox admin (Playground default admin/password) and drive the real
 * REST API and the real settings form. Nothing here is shipped; the theme and plugin have no test endpoints.
 */
export interface Api {
  ctx: APIRequestContext;
  nonce: string;
  /** Everything this test created, so cleanup() deletes just that (each request costs ~1 s on the sandbox). */
  made: Array<{ route: string; id: number }>;
  settingsDirty: boolean;
}

const base = () => `http://localhost:${process.env.WP_PORT ?? '8888'}`;
const rest = (path: string, query = '') => `/?rest_route=${encodeURIComponent(path)}${query ? `&${query}` : ''}`;

export async function adminApi(): Promise<Api> {
  const ctx = await request.newContext({ baseURL: base() });
  const login = await ctx.post('/wp-login.php', { form: { log: 'admin', pwd: 'password', 'wp-submit': 'Log In', testcookie: '1' }, headers: { Cookie: 'wordpress_test_cookie=WP%20Cookie%20check' }, maxRedirects: 0 });
  expect([302, 303], 'admin login').toContain(login.status());
  const nonce = (await (await ctx.get('/wp-admin/admin-ajax.php?action=rest-nonce')).text()).trim();
  expect(nonce, 'rest nonce').toMatch(/^[a-f0-9]{10}$/);
  return { ctx, nonce, made: [], settingsDirty: false };
}

export async function send(api: Api, method: 'POST' | 'PUT' | 'DELETE' | 'GET', path: string, data?: unknown, query = '') {
  const res = await api.ctx.fetch(rest(path, query), { method, headers: { 'X-WP-Nonce': api.nonce }, data: data as never });
  if (!res.ok()) throw new Error(`${method} ${path} -> ${res.status()} ${await res.text()}`);
  return res.json();
}

export interface AppInput {
  title: string;
  status?: 'publish' | 'draft' | 'private';
  delivery?: 'live' | 'coming_soon' | 'draft';
  price?: string;
  tagline?: string;
  platforms?: string;
  features?: string[];
  faq?: Array<{ q: string; a: string }>;
  launchUrl?: string;
  demoUrl?: string;
  wooProductId?: number;
  /** Editor content (shown on the page under Requirements). */
  content?: string;
  categories?: number[];
  media?: number;
  /** Version added at creation (the form adds one per save; use addVersion for more). */
  version?: { version: string; changelog: string; attachment?: number };
}

/** Submit the real classic edit form for a new app (`id` omitted) or an existing one. */
async function saveAppForm(api: Api, a: AppInput, id?: number): Promise<number> {
  // The app meta lives in the "Product details" meta box (the post type has no custom-fields support, so REST cannot
  // write it). Open the editor to get the auto-draft id and the nonces, then save it.
  const html = await (await api.ctx.get(id ? `/wp-admin/post.php?post=${id}&action=edit` : '/wp-admin/post-new.php?post_type=app')).text();
  const grab = (re: RegExp) => {
    const m = re.exec(html);
    if (!m) throw new Error(`editor field missing: ${re}`);
    return m[1];
  };
  const postId = Number(grab(/name='post_ID' value='(\d+)'/));
  const form = new URLSearchParams({
    action: 'editpost',
    originalaction: 'editpost',
    post_type: 'app',
    post_ID: String(postId),
    _wpnonce: grab(/id="_wpnonce" name="_wpnonce" value="([a-f0-9]+)"/),
    ideatoapps_details_nonce: grab(/name="ideatoapps_details_nonce" value="([a-f0-9]+)"/),
    ideatoapps_versions_nonce: grab(/name="ideatoapps_versions_nonce" value="([a-f0-9]+)"/),
    post_title: a.title,
    content: a.content ?? '',
    post_status: a.status ?? 'publish',
    ita_delivery_status: a.delivery ?? 'live',
    ita_price_label: a.price ?? '',
    ita_tagline: a.tagline ?? '',
    ita_platforms: a.platforms ?? '',
    ita_launch_url: a.launchUrl ?? '',
    ita_demo_url: a.demoUrl ?? '',
    ita_woo_product_id: a.wooProductId ? String(a.wooProductId) : '',
    ita_features: (a.features ?? []).join('\n'),
    _thumbnail_id: String(a.media ?? -1),
  });
  for (const row of a.faq ?? []) {
    form.append('ita_faq_q[]', row.q);
    form.append('ita_faq_a[]', row.a);
  }
  if (a.version) {
    form.set('ita_new_version', a.version.version);
    form.set('ita_new_changelog', a.version.changelog);
    form.set('ita_new_attachment', String(a.version.attachment ?? 0));
  }
  for (const c of a.categories ?? []) form.append('tax_input[app_category][]', String(c));
  const res = await api.ctx.post('/wp-admin/post.php', { data: form.toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, maxRedirects: 0 });
  expect(res.status(), `save app "${a.title}"`).toBe(302);
  return postId;
}

export async function createApp(api: Api, a: AppInput): Promise<number> {
  const id = await saveAppForm(api, a);
  api.made.push({ route: '/wp/v2/app', id });
  return id;
}

/** Add another version to an existing app (re-saves the form with the app's current input). */
export async function addVersion(api: Api, id: number, a: AppInput, version: NonNullable<AppInput['version']>): Promise<void> {
  await saveAppForm(api, { ...a, version }, id);
}

/** A WooCommerce simple product through the real REST API; returns its id. */
export async function createWooProduct(api: Api, name: string, price = '24.99'): Promise<number> {
  const body = await send(api, 'POST', '/wc/v3/products', { name, type: 'simple', regular_price: price, status: 'publish', virtual: true });
  api.made.push({ route: '/wc/v3/products', id: body.id });
  return body.id;
}

/**
 * A video through the REST API, then its "Video details" box through the real edit form (the video type has no
 * custom-fields support, so REST cannot write the YouTube ID or related app; the owner uses this box too).
 */
export async function createVideo(api: Api, title: string, opts: { status?: 'publish' | 'draft'; media?: number; youtubeId?: string; excerpt?: string; content?: string; relatedApp?: number } = {}): Promise<number> {
  const status = opts.status ?? 'publish';
  const body = await send(api, 'POST', '/wp/v2/video', { title, status, featured_media: opts.media ?? 0, excerpt: opts.excerpt ?? '', content: opts.content ?? '' });
  api.made.push({ route: '/wp/v2/video', id: body.id });
  if (opts.youtubeId || opts.relatedApp) {
    const html = await (await api.ctx.get(`/wp-admin/post.php?post=${body.id}&action=edit`)).text();
    const grab = (re: RegExp) => {
      const m = re.exec(html);
      if (!m) throw new Error(`video editor field missing: ${re}`);
      return m[1];
    };
    const form = new URLSearchParams({
      action: 'editpost',
      originalaction: 'editpost',
      post_type: 'video',
      post_ID: String(body.id),
      _wpnonce: grab(/id="_wpnonce" name="_wpnonce" value="([a-f0-9]+)"/),
      ideatoapps_video_nonce: grab(/name="ideatoapps_video_nonce" value="([a-f0-9]+)"/),
      post_title: title,
      content: opts.content ?? '',
      excerpt: opts.excerpt ?? '',
      post_status: status,
      ita_youtube_id: opts.youtubeId ?? '',
      ita_related_app_id: String(opts.relatedApp ?? 0),
      _thumbnail_id: String(opts.media ?? -1),
    });
    const res = await api.ctx.post('/wp-admin/post.php', { data: form.toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, maxRedirects: 0 });
    expect(res.status(), `save video "${title}"`).toBe(302);
  }
  return body.id;
}

export async function createPost(api: Api, title: string, opts: { status?: 'publish' | 'draft'; content?: string; date?: string } = {}): Promise<number> {
  const body = await send(api, 'POST', '/wp/v2/posts', { title, status: opts.status ?? 'publish', content: opts.content ?? '', excerpt: `About ${title}.`, ...(opts.date ? { date: opts.date } : {}) });
  api.made.push({ route: '/wp/v2/posts', id: body.id });
  return body.id;
}

export async function createCategory(api: Api, name: string): Promise<number> {
  const id = (await send(api, 'POST', '/wp/v2/app_category', { name })).id;
  api.made.push({ route: '/wp/v2/app_category', id });
  return id;
}

export async function trash(api: Api, type: 'app' | 'video' | 'posts', id: number): Promise<void> {
  await send(api, 'DELETE', `/wp/v2/${type}/${id}`);
}

/** 1x1 PNG uploaded to the media library; returns the attachment id. */
export async function uploadImage(api: Api, name = 'shot.png'): Promise<number> {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const res = await api.ctx.fetch(rest('/wp/v2/media'), {
    method: 'POST',
    headers: { 'X-WP-Nonce': api.nonce, 'Content-Disposition': `attachment; filename="${name}"`, 'Content-Type': 'image/png' },
    data: png,
  });
  expect(res.ok(), 'media upload').toBe(true);
  const id = (await res.json()).id;
  api.made.push({ route: '/wp/v2/media', id });
  return id;
}

/** Any small file uploaded to the media library (e.g. a fake zip as a version attachment); returns the attachment id. */
export async function uploadFile(api: Api, name: string, type: string, data: Buffer): Promise<number> {
  const res = await api.ctx.fetch(rest('/wp/v2/media'), {
    method: 'POST',
    headers: { 'X-WP-Nonce': api.nonce, 'Content-Disposition': `attachment; filename="${name}"`, 'Content-Type': type },
    data,
  });
  expect(res.ok(), `upload ${name}: ${res.ok() ? '' : await res.text()}`).toBe(true);
  const id = (await res.json()).id;
  api.made.push({ route: '/wp/v2/media', id });
  return id;
}

/**
 * A valid (empty) zip whose end-of-archive comment carries `marker`, so each version's download is distinguishable.
 * First bytes are 'PK', which is what the purchase test checks.
 */
export function zipBytes(marker: string): Buffer {
  const comment = Buffer.from(marker, 'utf8');
  const eocd = Buffer.alloc(22);
  eocd.write('PK\x05\x06', 0, 'binary');
  eocd.writeUInt16LE(comment.length, 20);
  return Buffer.concat([eocd, comment]);
}

/** A release zip in the media library (the version picker's job in wp-admin); returns the attachment id. */
export const uploadZip = (api: Api, version: string) => uploadFile(api, `ClipForge-${version}.zip`, 'application/zip', zipBytes(`ClipForge ${version}`));

/** Enable WooCommerce's offline Cash on delivery gateway: the stand-in for Stripe, which has no test keys here. */
export async function enableOfflineGateway(api: Api): Promise<void> {
  await send(api, 'PUT', '/wc/v3/payment_gateways/cod', { enabled: true });
}

/** Save the IdeaToApps settings through the real admin form (nonce included). Returns the redirect URL. */
export async function saveSettings(api: Api, s: { featured?: number[]; channel?: string; contact?: boolean }): Promise<string> {
  api.settingsDirty = s.featured?.length || s.channel || s.contact ? true : false;
  const page = await (await api.ctx.get('/wp-admin/options-general.php?page=ideatoapps-settings')).text();
  const nonce = /name="_wpnonce" value="([a-f0-9]+)"/.exec(page)?.[1];
  expect(nonce, 'settings form nonce').toBeTruthy();
  const form = new URLSearchParams({ action: 'ideatoapps_save_settings', _wpnonce: nonce!, youtube_channel_url: s.channel ?? '' });
  if (s.contact) form.set('contact_enabled', '1');
  // A <select multiple> submits the selected options in the order they appear in the list, not the order they were clicked.
  const listed = [...page.matchAll(/<option value="(\d+)"/g)].map((m) => Number(m[1]));
  for (const id of listed.filter((id) => (s.featured ?? []).includes(id))) form.append('featured_app_ids[]', String(id));
  const res = await api.ctx.post('/wp-admin/admin-post.php', { data: form.toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, maxRedirects: 0 });
  expect(res.status(), 'settings save redirects').toBe(302);
  return res.headers()['location'] ?? '';
}

/** Delete what this test made (permanently) and clear the settings it changed. */
export async function cleanup(api: Api): Promise<void> {
  for (const { route, id } of api.made.splice(0).reverse()) {
    const res = await api.ctx.fetch(rest(`${route}/${id}`, 'force=true'), { method: 'DELETE', headers: { 'X-WP-Nonce': api.nonce } });
    if (!res.ok() && res.status() !== 404) throw new Error(`cleanup ${route}/${id} -> ${res.status()}`);
  }
  if (api.settingsDirty) await saveSettings(api, {});
}

/** Back to a blank site: no apps, videos, categories, media or settings. Safe to call repeatedly. */
export async function resetContent(api: Api): Promise<void> {
  for (const [route, query] of [
    ['/wp/v2/app', 'status=any&per_page=100'],
    ['/wp/v2/video', 'status=any&per_page=100'],
    ['/wp/v2/posts', 'status=any&per_page=100'],
    ['/wp/v2/app_category', 'per_page=100'],
    ['/wp/v2/media', 'per_page=100&status=inherit,private'],
    ['/wc/v3/orders', 'per_page=100&status=any'],
    ['/wc/v3/customers', 'per_page=100'],
    ['/wc/v3/products', 'per_page=100&status=any'],
  ] as const) {
    const listed = await api.ctx.fetch(rest(route, query), { headers: { 'X-WP-Nonce': api.nonce } });
    if (listed.status() === 404) continue; // that content type is not registered (yet)
    const items: Array<{ id: number }> = await listed.json();
    for (const it of items) await send(api, 'DELETE', `${route}/${it.id}`, undefined, 'force=true');
  }
  await saveSettings(api, {});
}
