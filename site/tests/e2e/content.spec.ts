import { test, expect, type Page } from '@playwright/test';
import { axeProblems } from './helpers/a11y';
import { horizontalOverflow } from './helpers/layout';
import { adminApi, cleanup, createApp, createPost, createVideo, resetContent, saveSettings, trash, type Api } from './helpers/wp';

// These tests change site content; the server is shared, so run them one at a time and leave the site blank.
test.describe.configure({ mode: 'serial' });

let api: Api;
test.beforeAll(async () => { api = await adminApi(); await resetContent(api); });
test.afterEach(async () => { await cleanup(api); });
test.afterAll(async () => { await resetContent(api); });

const YT = 'dQw4w9WgXcQ';
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/;
const text = (page: Page) => page.locator('main').innerText();
const nav = (page: Page) => page.getByRole('navigation', { name: 'Primary' });
const footer = (page: Page) => page.getByRole('navigation', { name: 'Footer' });
const wpJson = (path: string) => `/?rest_route=${encodeURIComponent(path)}`;

test.describe('Learn', () => {
  test('with no videos: empty state, no Learn link in the header or footer, no player', async ({ page }) => {
    await page.goto('/learn/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Learn');
    await expect(page.getByTestId('learn-empty')).toBeVisible();
    await expect(nav(page).getByRole('link', { name: 'Learn' })).toHaveCount(0);
    await expect(footer(page).getByRole('link', { name: 'Learn' })).toHaveCount(0);
    await expect(page.locator('iframe, .video-card')).toHaveCount(0);
    await page.goto('/');
    await expect(nav(page).getByRole('link', { name: 'Learn' })).toHaveCount(0);
  });

  test('a published video adds Learn to the header and footer; a draft does not; trashing removes it again', async ({ page }) => {
    await createVideo(api, 'Hidden draft', { status: 'draft', youtubeId: YT });
    await page.goto('/');
    await expect(nav(page).getByRole('link', { name: 'Learn' })).toHaveCount(0);
    const id = await createVideo(api, 'First look', { youtubeId: YT });
    await page.goto('/');
    await expect(nav(page).getByRole('link', { name: 'Learn' })).toHaveAttribute('href', /\/learn\/$/);
    await expect(footer(page).getByRole('link', { name: 'Learn' })).toHaveCount(1);
    await expect(nav(page).getByRole('link')).toHaveText(['Apps', 'Learn', 'Blog', 'About']);
    await page.goto('/learn/');
    await expect(nav(page).getByRole('link', { name: 'Learn' })).toHaveAttribute('aria-current', 'page');
    expect(await text(page)).not.toContain('Hidden draft');
    await trash(api, 'video', id);
    await page.goto('/');
    await expect(nav(page).getByRole('link', { name: 'Learn' })).toHaveCount(0);
  });

  test('the YouTube player loads only after a click: no iframe and no YouTube request in the initial page', async ({ page }) => {
    await createVideo(api, 'Walkthrough', { youtubeId: YT, excerpt: 'A tour of the editor.' });
    const hosts = new Set<string>();
    page.on('request', (r) => { try { hosts.add(new URL(r.url()).host); } catch { /* data: urls */ } });
    await page.route('https://www.youtube-nocookie.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>player stub</p>' }));

    const raw = await (await page.request.get('/learn/')).text();
    expect(raw).not.toMatch(/<iframe/i);
    expect(raw).not.toContain('youtube-nocookie.com');

    await page.goto('/learn/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('iframe')).toHaveCount(0);
    expect([...hosts].filter((h) => h !== 'localhost:8888'), 'no third-party request before the click').toEqual([]);

    const play = page.getByRole('button', { name: 'Play video: Walkthrough' });
    await expect(play).toBeVisible();
    await play.click();
    const frame = page.locator('iframe');
    await expect(frame).toHaveCount(1);
    await expect(frame).toHaveAttribute('src', new RegExp(`^https://www\\.youtube-nocookie\\.com/embed/${YT}\\?autoplay=1`));
    await expect(frame).toHaveAttribute('title', 'Walkthrough');
    await expect(play).toHaveCount(0);
    await expect(frame).toBeFocused();
  });

  test('a video without a YouTube ID is listed with no play button; a bad ID is never saved', async ({ page }) => {
    await createVideo(api, 'Coming later', { excerpt: 'Soon.' });
    await page.goto('/learn/');
    await expect(page.getByTestId('video-card')).toHaveCount(1);
    await expect(page.getByRole('button')).toHaveCount(2); // theme toggle + menu button only
    await expect(page.locator('[data-youtube-id]')).toHaveCount(0);
  });

  test('the channel link shows only when a URL is set; the video page shows the related app only when visible', async ({ page }) => {
    const app = await createApp(api, { title: 'ClipForge', price: '$24.99 one-time' });
    const id = await createVideo(api, 'Tour', { youtubeId: YT, relatedApp: app, content: '<p>What you will see.</p>' });
    await page.goto('/learn/');
    await expect(page.getByRole('link', { name: /YouTube channel/ })).toHaveCount(0);
    await expect(page.getByTestId('video-card').getByRole('link', { name: 'ClipForge' })).toHaveAttribute('href', /clipforge/);
    await saveSettings(api, { channel: 'https://www.youtube.com/@ideatoapps' });
    await page.goto('/learn/');
    await expect(page.getByRole('link', { name: /YouTube channel/ })).toHaveAttribute('href', 'https://www.youtube.com/@ideatoapps');

    await page.goto(`/?p=${id}&post_type=video`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tour');
    await expect(page.getByRole('button', { name: 'Play video: Tour' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'See ClipForge' })).toHaveAttribute('href', /clipforge/);
    expect(await text(page)).toContain('What you will see.');

    await createApp(api, { title: 'Draft only', status: 'draft' });
    await trash(api, 'app', app);
    await page.goto('/learn/');
    await expect(page.getByTestId('video-card').getByRole('link', { name: 'ClipForge' })).toHaveCount(0);
  });
});

test.describe('Blog', () => {
  test('no posts: an empty state, no list and no empty box', async ({ page }) => {
    await page.goto('/blog/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Blog');
    await expect(page.getByTestId('blog-empty')).toContainText('No posts yet');
    await expect(page.getByTestId('blog-list')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Blog pages' })).toHaveCount(0);
  });

  test('posts are listed newest first, drafts never, with a working post page', async ({ page }) => {
    await createPost(api, 'Older note', { date: '2026-01-01T10:00:00' });
    await createPost(api, 'Newer note', { date: '2026-02-01T10:00:00', content: '<p>Body text here.</p>' });
    await createPost(api, 'Secret draft', { status: 'draft' });
    await page.goto('/blog/');
    await expect(page.getByTestId('blog-empty')).toHaveCount(0);
    await expect(page.getByTestId('blog-list').locator('article h2')).toHaveText(['Newer note', 'Older note']);
    expect(await text(page)).not.toContain('Secret draft');
    await page.getByRole('link', { name: 'Newer note' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Newer note');
    await expect(page.getByTestId('post')).toContainText('Body text here.');
    await expect(page.getByRole('link', { name: 'Blog' }).first()).toBeVisible();
  });

  test('more than nine posts paginate with plain links', async ({ page }) => {
    test.setTimeout(120_000);
    for (let i = 1; i <= 10; i++) await createPost(api, `Post ${String(i).padStart(2, '0')}`, { date: `2026-03-${String(i).padStart(2, '0')}T10:00:00` });
    await page.goto('/blog/');
    await expect(page.getByTestId('blog-list').locator('article')).toHaveCount(9);
    await page.getByRole('link', { name: 'Older posts' }).click();
    await expect(page).toHaveURL(/pg=2/);
    await expect(page.getByTestId('blog-list').locator('article h2')).toHaveText(['Post 01']);
    await page.getByRole('link', { name: 'Newer posts' }).click();
    await expect(page.getByTestId('blog-list').locator('article')).toHaveCount(9);
  });
});

test.describe('About and FAQ', () => {
  test('About states only the tagline and that ClipForge is the first app; links ClipForge only when it is listed', async ({ page }) => {
    await page.goto('/about/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('About IdeaToApps');
    const body = await text(page);
    expect(body).toContain('Useful apps. Brilliant ideas. One place.');
    expect(body).toContain('ClipForge');
    expect(body).toContain('first app');
    expect(body).not.toMatch(/\b\d[\d,]*\+?\s+(customers|users|downloads)|testimonial|rated|\bstars?\b|since (19|20)\d\d|founded/i);
    expect(body).not.toMatch(EMAIL);
    await expect(page.getByRole('link', { name: 'See ClipForge' })).toHaveCount(0);
    await createApp(api, { title: 'ClipForge' });
    await page.goto('/about/');
    await expect(page.getByRole('link', { name: 'See ClipForge' })).toHaveAttribute('href', /clipforge/);
  });

  test('FAQ answers use README facts only and open and close', async ({ page }) => {
    await page.goto('/faq/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const items = page.locator('details.faq__item');
    await expect(items).toHaveCount(5);
    const body = await page.locator('main').evaluate((m) => m.textContent ?? '');
    expect(body).toContain('$24.99');
    expect(body).toMatch(/no free trial/i);
    expect(body).toContain('Python 3 or Node.js');
    expect(body).toMatch(/Safari is untested/);
    expect(body).not.toMatch(/\bEdge\b|Windows|macOS|Linux|account library|free to try|refund within/i);
    await items.first().locator('summary').click();
    await expect(items.first()).toHaveAttribute('open', '');
    await items.first().locator('summary').click();
    await expect(items.first()).not.toHaveAttribute('open', '');
  });
});

test.describe('legal pages', () => {
  for (const [path, title] of [['/privacy/', 'Privacy policy'], ['/terms/', 'Terms of service'], ['/refund-policy/', 'Refund policy']] as const) {
    test(`${path} shows the DRAFT banner, owner placeholders and no invented facts`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
      await expect(page.getByTestId('draft-banner')).toBeVisible();
      await expect(page.getByTestId('draft-banner')).toContainText('DRAFT, pending legal review');
      expect(await page.locator('mark.owner-confirm').count()).toBeGreaterThan(0);
      const body = await text(page);
      expect(body).toMatch(/Owner to confirm/);
      expect(body).not.toMatch(EMAIL);
      expect(body).not.toMatch(/\b\d+[- ]days?\b|\bLtd\b|\bLLC\b|\bInc\b|GmbH|\bVAT (number|no)|money-back/i);
      expect(body).not.toMatch(/emails? (you|will)|we will (send|email)/i);
    });
  }

  test('the banner is only on legal pages', async ({ page }) => {
    for (const path of ['/about/', '/faq/', '/contact/', '/blog/']) {
      await page.goto(path);
      await expect(page.getByTestId('draft-banner')).toHaveCount(0);
    }
  });
});

test.describe('Contact', () => {
  test('disabled by default: a plain notice, no form, no email address; the endpoint answers 503', async ({ page }) => {
    await page.goto('/contact/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Contact');
    await expect(page.getByTestId('contact-unavailable')).toContainText('not yet available');
    await expect(page.locator('form')).toHaveCount(0);
    expect(await page.locator('body').innerHTML()).not.toMatch(EMAIL);
    expect(await page.locator('a[href^="mailto:"]').count()).toBe(0);
    const res = await page.request.post(wpJson('/ideatoapps/v1/contact'), { data: { name: 'A', email: 'a@example.com', message: 'Hi', website: '' } });
    expect(res.status()).toBe(503);
    expect((await res.json()).message).toMatch(/not yet available/);
  });

  test('once the owner enables it the form shows with labelled fields and a hidden honeypot', async ({ page }) => {
    await saveSettings(api, { contact: true });
    await page.goto('/contact/');
    const form = page.getByTestId('contact-form');
    await expect(form).toBeVisible();
    for (const label of ['Name', 'Email address', 'Message']) await expect(form.getByLabel(label, { exact: true })).toBeVisible();
    await expect(form.locator('input[name="website"]')).not.toBeInViewport();
    await expect(form.locator('input[name="website"]')).toHaveAttribute('tabindex', '-1');
    expect(await page.locator('body').innerHTML()).not.toMatch(EMAIL);
    await expect(page.getByTestId('contact-unavailable')).toHaveCount(0);
  });

  test('submitting sends JSON with the nonce header and shows the answer; errors are announced', async ({ page }) => {
    await saveSettings(api, { contact: true });
    await page.goto('/contact/');
    let seen: { body: Record<string, unknown>; nonce: string | undefined } | null = null;
    await page.route('**/ideatoapps/v1/contact*', async (route) => {
      seen = { body: route.request().postDataJSON(), nonce: route.request().headers()['x-wp-nonce'] };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, message: 'Thanks, your message was sent.' }) });
    });
    await page.getByLabel('Name', { exact: true }).fill('Ann');
    await page.getByLabel('Email address', { exact: true }).fill('ann@example.com');
    await page.getByLabel('Message').fill('Hello there');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByTestId('form-status')).toHaveText('Thanks, your message was sent.');
    expect(seen!.body).toEqual({ name: 'Ann', email: 'ann@example.com', message: 'Hello there', website: '' });
    expect(seen!.nonce).toMatch(/^[a-f0-9]{10}$/);
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('');

    await page.unroute('**/ideatoapps/v1/contact*');
    await page.route('**/ideatoapps/v1/contact*', (route) => route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ code: 'ideatoapps_rate_limited', message: 'Too many requests. Please wait a minute and try again.' }) }));
    await page.getByLabel('Name', { exact: true }).fill('Ann');
    await page.getByLabel('Email address', { exact: true }).fill('ann@example.com');
    await page.getByLabel('Message').fill('Again');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByTestId('form-status')).toContainText('Too many requests');
    await expect(page.getByRole('button', { name: 'Send message' })).toBeEnabled();
    await expect(page.getByLabel('Message')).toHaveValue('Again'); // nothing is lost on an error
  });

  test('the real endpoint rejects a filled honeypot (400) and a missing nonce (403) when enabled', async ({ page }) => {
    await saveSettings(api, { contact: true });
    await page.goto('/contact/');
    const nonce = await page.locator('form[data-nonce]').getAttribute('data-nonce');
    const post = (data: object, headers: Record<string, string> = { 'X-WP-Nonce': nonce! }) => page.request.post(wpJson('/ideatoapps/v1/contact'), { data, headers });
    expect((await post({ name: 'Bot', email: 'b@example.com', message: 'x', website: 'http://spam.example' })).status()).toBe(400);
    expect((await post({ name: 'A', email: 'a@example.com', message: 'x', website: '' }, {})).status()).toBe(403);
  });
});

test.describe('Newsletter', () => {
  test('the home sign-up exists now that the endpoint does, with a consent checkbox and no promise of mail', async ({ page }) => {
    await page.goto('/');
    const section = page.getByTestId('newsletter');
    await expect(section).toBeVisible();
    await expect(section.getByLabel('Email address', { exact: true })).toBeVisible();
    await expect(section.getByRole('checkbox')).toBeVisible();
    const body = await section.innerText();
    expect(body).not.toMatch(/emails? (you|will)|we will (send|email)|unsubscribe|sent to your inbox/i);
  });

  test('consent is required: submitting without it sends nothing', async ({ page }) => {
    await page.goto('/');
    let calls = 0;
    await page.route('**/ideatoapps/v1/newsletter*', (route) => { calls++; return route.abort(); });
    await page.getByTestId('newsletter').getByLabel('Email address', { exact: true }).fill('reader@example.com');
    await page.getByRole('button', { name: 'Subscribe' }).click();
    await expect(page.getByTestId('newsletter').getByRole('checkbox')).toBeFocused();
    expect(calls).toBe(0);
  });

  test('a real sign-up is accepted, then the endpoint refuses missing consent, a bad email and a bad nonce', async ({ page }) => {
    await page.goto('/');
    const section = page.getByTestId('newsletter');
    await section.getByLabel('Email address', { exact: true }).fill(`reader${Date.now()}@example.com`);
    await section.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Subscribe' }).click();
    await expect(section.getByTestId('form-status')).toHaveText('Thanks, you are on the list.');
    await expect(section.getByLabel('Email address', { exact: true })).toHaveValue('');
    await expect(section.getByRole('checkbox')).not.toBeChecked();

    const nonce = (await section.locator('form').getAttribute('data-nonce'))!;
    const post = (data: object, headers: Record<string, string> = { 'X-WP-Nonce': nonce }) => page.request.post(wpJson('/ideatoapps/v1/newsletter'), { data, headers });
    expect((await post({ email: 'x@example.com' })).status(), 'no consent').toBe(400);
    expect((await post({ email: 'nope', consent: true })).status(), 'bad email').toBe(400);
    expect((await post({ email: 'x@example.com', consent: true }, {})).status(), 'no nonce').toBe(403);
  });

  test('a rate-limit answer is shown to the visitor and the form stays usable', async ({ page }) => {
    await page.goto('/');
    await page.route('**/ideatoapps/v1/newsletter*', (route) => route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ message: 'Too many requests. Please wait a minute and try again.' }) }));
    const section = page.getByTestId('newsletter');
    await section.getByLabel('Email address', { exact: true }).fill('reader@example.com');
    await section.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Subscribe' }).click();
    await expect(section.getByTestId('form-status')).toContainText('Too many requests');
    await expect(page.getByRole('button', { name: 'Subscribe' })).toBeEnabled();
  });

  test('the Blog and Learn pages offer the sign-up too', async ({ page }) => {
    await page.goto('/blog/');
    await expect(page.getByTestId('newsletter')).toHaveCount(1);
    await createVideo(api, 'Any video', { youtubeId: YT });
    await page.goto('/learn/');
    await expect(page.getByTestId('newsletter')).toHaveCount(1);
  });
});

// Every new template, both themes, 360px and desktop: AA contrast/axe and no horizontal overflow.
type Setup = (api: Api) => Promise<void>;
const states: Array<{ name: string; path: string; setup?: Setup }> = [
  { name: 'learn empty', path: '/learn/' },
  { name: 'learn populated', path: '/learn/', setup: async (a) => { await createVideo(a, 'A rather long walkthrough title that has to wrap on small screens', { youtubeId: YT, excerpt: 'A tour of the editor.' }); await createVideo(a, 'No player yet'); } },
  { name: 'video page', path: '/?post_type=video&p=', setup: async (a) => { await createVideo(a, 'Tour', { youtubeId: YT, content: '<p>What you will see.</p>' }); } },
  { name: 'blog empty', path: '/blog/' },
  { name: 'blog populated', path: '/blog/', setup: async (a) => { await createPost(a, 'First note'); await createPost(a, 'Second note'); } },
  { name: 'post', path: '/?p=', setup: async (a) => { await createPost(a, 'A note', { content: '<h2>Heading</h2><p>Some text.</p><ul><li>One</li></ul>' }); } },
  { name: 'about', path: '/about/' },
  { name: 'faq', path: '/faq/' },
  { name: 'contact disabled', path: '/contact/' },
  { name: 'contact enabled', path: '/contact/', setup: async (a) => { await saveSettings(a, { contact: true }); } },
  { name: 'privacy', path: '/privacy/' },
  { name: 'terms', path: '/terms/' },
  { name: 'refund', path: '/refund-policy/' },
  { name: 'home with newsletter', path: '/' },
];

for (const scheme of ['dark', 'light'] as const) {
  for (const [label, width, height] of [['360px', 360, 740], ['desktop', 1280, 900]] as const) {
    test.describe(`${scheme} ${label}: accessibility and layout`, () => {
      test.use({ colorScheme: scheme, viewport: { width, height } });
      for (const st of states) {
        test(st.name, async ({ page }) => {
          let path = st.path;
          if (st.setup) {
            await st.setup(api);
            if (path.endsWith('p=')) {
              const type = path.includes('post_type=video') ? 'video' : 'posts';
              const list = await (await api.ctx.fetch(wpJson(`/wp/v2/${type}`) + '&per_page=1&orderby=date&order=desc', { headers: { 'X-WP-Nonce': api.nonce } })).json();
              path += list[0].id;
            }
          }
          await page.goto(path);
          await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(300);
          expect(await horizontalOverflow(page), `${st.name} overflows horizontally`).toBeLessThanOrEqual(0);
          expect(await axeProblems(page)).toEqual([]);
        });
      }
    });
  }
}
