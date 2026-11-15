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

async function send(api: Api, method: 'POST' | 'DELETE' | 'GET', path: string, data?: unknown, query = '') {
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
  categories?: number[];
  media?: number;
}

export async function createApp(api: Api, a: AppInput): Promise<number> {
  // The app meta lives in the "Product details" meta box (the post type has no custom-fields support, so REST cannot
  // write it). Submit the real classic edit form: open a new app to get an auto-draft id and the nonces, then save it.
  const html = await (await api.ctx.get('/wp-admin/post-new.php?post_type=app')).text();
  const grab = (re: RegExp) => {
    const m = re.exec(html);
    if (!m) throw new Error(`editor field missing: ${re}`);
    return m[1];
  };
  const id = Number(grab(/name='post_ID' value='(\d+)'/));
  const form = new URLSearchParams({
    action: 'editpost',
    originalaction: 'editpost',
    post_type: 'app',
    post_ID: String(id),
    _wpnonce: grab(/id="_wpnonce" name="_wpnonce" value="([a-f0-9]+)"/),
    ideatoapps_details_nonce: grab(/name="ideatoapps_details_nonce" value="([a-f0-9]+)"/),
    post_title: a.title,
    post_status: a.status ?? 'publish',
    ita_delivery_status: a.delivery ?? 'live',
    ita_price_label: a.price ?? '',
    ita_tagline: a.tagline ?? '',
    _thumbnail_id: String(a.media ?? -1),
  });
  for (const c of a.categories ?? []) form.append('tax_input[app_category][]', String(c));
  const res = await api.ctx.post('/wp-admin/post.php', { data: form.toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, maxRedirects: 0 });
  expect(res.status(), `save app "${a.title}"`).toBe(302);
  api.made.push({ route: '/wp/v2/app', id });
  return id;
}

export async function createVideo(api: Api, title: string, opts: { status?: 'publish' | 'draft'; media?: number } = {}): Promise<number> {
  const body = await send(api, 'POST', '/wp/v2/video', {
    title,
    status: opts.status ?? 'publish',
    featured_media: opts.media ?? 0,
  });
  api.made.push({ route: '/wp/v2/video', id: body.id });
  return body.id;
}

export async function createCategory(api: Api, name: string): Promise<number> {
  const id = (await send(api, 'POST', '/wp/v2/app_category', { name })).id;
  api.made.push({ route: '/wp/v2/app_category', id });
  return id;
}

export async function trash(api: Api, type: 'app' | 'video', id: number): Promise<void> {
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

/** Save the IdeaToApps settings through the real admin form (nonce included). Returns the redirect URL. */
export async function saveSettings(api: Api, s: { featured?: number[]; channel?: string }): Promise<string> {
  api.settingsDirty = s.featured?.length || s.channel ? true : false;
  const page = await (await api.ctx.get('/wp-admin/options-general.php?page=ideatoapps-settings')).text();
  const nonce = /name="_wpnonce" value="([a-f0-9]+)"/.exec(page)?.[1];
  expect(nonce, 'settings form nonce').toBeTruthy();
  const form = new URLSearchParams({ action: 'ideatoapps_save_settings', _wpnonce: nonce!, youtube_channel_url: s.channel ?? '' });
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
    ['/wp/v2/app_category', 'per_page=100'],
    ['/wp/v2/media', 'per_page=100'],
  ] as const) {
    const listed = await api.ctx.fetch(rest(route, query), { headers: { 'X-WP-Nonce': api.nonce } });
    if (listed.status() === 404) continue; // that content type is not registered (yet)
    const items: Array<{ id: number }> = await listed.json();
    for (const it of items) await send(api, 'DELETE', `${route}/${it.id}`, undefined, 'force=true');
  }
  await saveSettings(api, {});
}
