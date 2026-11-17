# IdeaToApps AI Blog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** 50 reviewed AI-education articles with an interactive reading UI, installable as drafts from wp-admin.

**Architecture:** Plugin `ideatoapps-core` holds the shortcodes, content files (`content/articles/NN-slug.php`, guarded; `.html` before the final review) and the installer; theme `ideatoapps` holds single-post, blog-index and card styling. Everything degrades without JavaScript.

**Tech Stack:** PHP 8.0, WordPress core posts and categories, vanilla JS/CSS (no new dependencies), PHPUnit, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-16-ideatoapps-ai-blog-design.md`

## Global Constraints
- Byline states AI assistance and the human reviewer (Task 4c); no invented anecdotes, credentials, testimonials, quotes, studies, statistics; no stale facts (prices, versions, benchmarks); no email addresses; no legal/medical/financial advice.
- Installer: idempotent, drafts only, never overwrites an edited post, never deletes.
- Keep all existing `data-testid`s; existing e2e stays green. Files <= ~200 lines. Escape output, sanitise input, PHP 8.0.
- Commit trailers: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01AdHhRpWBrbnaseTnY78bTT`. Never push without the owner's explicit "push". No real mail, no live payments.

## Review Focus
- Article with a malformed or empty shortcode renders readable text, not a PHP notice.
- A reader without JavaScript still sees prompts, quiz answers (in a details block) and checklist items.
- Re-running the installer after the owner edited or published a post leaves it untouched; trashed starter posts are not recreated silently.
- `?q=` search and `?cat=` filter with odd input (very long, markup, unknown category) never error and are escaped.
- Dark and light contrast and 360px width for every new component (axe).

## The 50 topics (category: titles)
AI basics (1-8): What AI is and isn't; ML vs deep learning vs generative AI; A short history of AI; How a chatbot "knows" things; A plain-English AI glossary; AI myths that waste your time; Choosing an AI assistant; Your first week with AI.
Prompting (9-18): The four-part prompt recipe; Give context, get better answers; Prompting with examples; Asking for tables, checklists and JSON; Rewrite, don't restart; Reusable prompt templates; Role prompts: when they help; Breaking big tasks into steps; Fixing a bad answer; Prompting for images and video.
LLMs (19-26): Tokens explained; Context windows; Temperature and randomness; How LLMs are trained; Hallucinations and how to catch them; Open vs closed models; Running a model on your own computer; Reading a model comparison without being fooled.
Agents (27-36): What is an AI agent; Chatbot vs workflow vs agent; Tools and function calling; Memory in agents; Planning and loops; Your first simple agent, no code needed; MCP and connectors; When an agent goes wrong; Guardrails and human approval; Evaluating an agent.
Work and learning (37-44): AI as a study partner; Notes to flashcards and quizzes; Lesson plans with AI; AI for research and checking sources; Summarizing long documents; Automating boring tasks; AI for spreadsheets; An AI-assisted practice routine.
Safety and judgment (45-50): What not to paste into an AI tool; Bias in AI; Fact-checking an answer in five minutes; Copyright and AI (not legal advice); A calm guide for parents; Is an AI tool worth paying for.

---

### Task 1: Interactive shortcodes (plugin)
**Files:** Create `site/wp-content/plugins/ideatoapps-core/includes/blog-shortcodes.php`, `assets/blog.js`, `assets/blog.css`; Test `site/tests/php/BlogShortcodesTest.php`, `site/tests/e2e/blog-interactive.spec.ts`.
**Interfaces — Produces:** shortcodes `[ita_prompt title=""]text[/ita_prompt]`, `[ita_quiz]` with nested `[ita_q q="" answers="a|b|c" correct="2" why=""]`, `[ita_checklist id=""]` with `[ita_item]text[/ita_item]`, `[ita_why title=""]text[/ita_why]`, `[ita_term define=""]word[/ita_term]`. Assets enqueue only on singular posts.
- [ ] Failing PHPUnit tests: each shortcode renders escaped, valid markup; malformed input (missing `correct`, empty body, markup in attributes) degrades to plain text; quiz without JS shows answers inside `<details>`.
- [ ] Implement shortcodes + minimal JS (copy button via `navigator.clipboard` with fallback; quiz feedback; checklist state in `localStorage` wrapped in try/catch; glossary on hover/focus/tap).
- [ ] Failing then passing Playwright spec: copy button, quiz feedback, checklist persists across reload, no-JS static content (JS disabled context), axe clean at 360px in both themes.
- [ ] Mutation-check: break escaping and the no-JS fallback; tests must fail. Commit.

### Task 2: Single post experience (theme)
**Files:** Modify `themes/ideatoapps/single.php`; Create `inc/post-extras.php`, `assets/css/post.css`, `assets/js/post.js`; Test `site/tests/php/PostExtrasTest.php`, extend `content.spec.ts`.
**Interfaces — Produces:** `ideatoapps_reading_minutes( int $post_id ): int`, `ideatoapps_post_toc( string $html ): array{html:string,items:array}` (adds `id`s to `h2`), `ideatoapps_read_next( int $post_id, int $n ): WP_Post[]` (same category first), post meta `ita_last_reviewed` (YYYY-MM-DD).
- [ ] Failing tests: reading time rounds up, min 1; TOC ids are unique/stable with duplicate headings; read-next excludes current post and drafts.
- [ ] Implement hero (category, title, reading time, "Last reviewed"), sticky TOC (collapsible on mobile), reading-progress bar (`prefers-reduced-motion` safe), "Read next" cards, byline "IdeaToApps". Keep existing `data-testid="post"`.
- [ ] e2e: TOC links scroll, progress bar present, no horizontal overflow at 360/768/1440, axe clean light+dark. Commit.

### Task 2b: Images and diagrams (plugin + theme)
**Decision (owner asked "add images wherever needed"):** all images are original inline SVG made in this repo: free, no licences, no uploads, dark/light aware, tiny. No stock photos, no paid AI-image services, no real people, no logos of other companies.
**Files:** Create `includes/blog-figures.php`, `content/figures/*.svg` (hand-made diagrams), `scripts/make-blog-heroes.mjs` (deterministic abstract hero per article from slug + category palette), `content/heroes/*.svg` (generated), Test `site/tests/php/BlogFiguresTest.php`, extend `blog-interactive.spec.ts`.
**Interfaces - Produces:** shortcode `[ita_figure name="agent-loop" alt="..." caption="..."]` (inlines `content/figures/<name>.svg`, wraps in `<figure>`/`<figcaption>`, `role="img"` + `aria-label` from `alt`); `ideatoapps_post_hero_svg( int $post_id ): string` (inline hero from `content/heroes/<starter-slug>.svg`; none for non-starter posts); theme hero and blog cards use it when a post has no featured image.
- [ ] Failing tests: figure with unknown name or missing alt renders nothing (no notice); inlined SVG is sanitised (reject `<script>`, `on*=` attributes, `javascript:`, external `href`/`src`, `<foreignObject>`); every figure and hero file passes the same check; alt text required and <= 140 chars.
- [ ] Hand-make diagrams for the concept posts (at least: how a chatbot answers, token splitting, context window filling, training stages, agent loop, chatbot vs workflow vs agent, tool calling, memory types, guardrail/approval flow, evaluation loop, four-part prompt recipe, open vs closed models). Colours use CSS variables so light/dark both pass contrast.
- [ ] Hero generator script produces one distinct, abstract, text-free SVG per article (50) in category colours; cards and post hero use it. Cards keep a fixed aspect ratio (no layout shift).
- [ ] e2e: figure visible with caption, hero present on card and post, images have accessible names, axe clean, no horizontal overflow at 360px. Commit.
Content lint additions: each article has a hero file; every `ita_figure` name exists; concept posts listed above include at least one figure; articles have <= 3 figures.

### Task 3: Blog index (theme)
**Files:** Modify `page-blog.php`, `parts/post-list.php`, `parts/card.php` (reading time slot); Create `parts/blog-filters.php`, `assets/css/blog.css`; Test `site/tests/php/BlogQueryTest.php`, update `content.spec.ts` Blog block.
**Interfaces — Produces:** `ideatoapps_blog_query_args( array $get ): array` (reads `cat` slug and `q`, sanitised, length-capped), featured = newest post on page 1 with no filters.
- [ ] Failing tests: odd input (500-char q, `<script>`, unknown cat, array params) never errors and is capped/escaped; filters combine; pagination keeps `cat`/`q`.
- [ ] Implement chips (links, work without JS), search form (GET), featured post card, empty-results state, reading time on cards. Existing testids (`blog`, `blog-list`, `blog-empty`) preserved.
- [ ] e2e: filter, search, empty state, pagination, axe, overflow. Commit.

### Task 4: Starter-article installer (plugin)
**Files:** Create `includes/blog-installer.php`, `includes/blog-article-file.php`, admin button in `includes/settings.php`; Test `site/tests/php/BlogInstallerTest.php`.
**Interfaces — Produces:** article file format: first line JSON header `{"slug","title","category","excerpt","reviewed"}` in an HTML comment, then body; `ideatoapps_blog_install(): array{created:int,skipped:int}`; post meta `ita_starter_slug`, `ita_starter_hash`.
- [ ] Failing tests: creates drafts with category + `ita_last_reviewed`; second run creates 0; a post whose content differs from `ita_starter_hash` is skipped; trashed starter posts are not recreated; non-admin and bad nonce refused; never publishes or deletes.
- [ ] Implement capability + nonce checked admin-post action, result notice in Settings > IdeaToApps.
- [ ] Mutation-check hash guard and nonce. Commit.

### Task 4b: Subscriber-only posts with a teaser (plugin + theme)
**Owner request:** show a glimpse of a few posts; reading the rest requires subscribing (the confirmed newsletter list).
**Rulings:**
- Ruling: gate = per-post checkbox "Subscribers only" (post meta `ita_gated`) in the editor; the installer flags 6 starter articles (the longest practical guides: 8, 14, 32, 36, 42, 44). The owner can change any post. Everything else stays open.
- Ruling: a reader is "a subscriber" only after clicking the confirm link in the double opt-in email; the confirm page then sets a signed, HttpOnly, SameSite=Lax cookie `ita_reader` (HMAC over subscriber id + expiry, `wp_salt('auth')`, 180 days). Server checks the cookie AND that the subscriber is still `confirmed` (unsubscribe/erasure locks access at once).
- Ruling: new device or cleared cookies: "Already subscribed? Email me a reading link" form sends a one-time signed link (POST-to-activate like confirm/unsubscribe; neutral identical response whether or not the address is on the list; rate limited; no enumeration).
- Ruling: while `ideatoapps_newsletter_enabled` is off, gating is OFF (articles show in full) so nobody is locked out with no way in.
- Ruling: teaser = first ~120 words (up to the first heading after them) fading out, then the subscribe card (email + consent tick + the existing sign-up endpoint). Copy is honest: free, we send a confirmation email first, nothing is sent until you confirm, unsubscribe any time. No dark patterns, no countdowns, no fake scarcity.
- Ruling: SEO-safe: teaser is real server-rendered text; Article JSON-LD gets `isAccessibleForFree: false` + `hasPart` with `cssSelector` for the gated section; the full body is never in the HTML sent to non-subscribers (no CSS-only hiding); gated pages are cacheable-safe (`Cache-Control: private` for gated responses).
- Owner decision (flagged, not buildable by me): tying free reading to a marketing-newsletter sign-up is a consent question under GDPR and similar laws (consent must be freely given). The legal pages are DRAFT and need legal review before launch; if counsel objects, the fallback is to gate on "confirmed email" without marketing consent. That is NOT just a copy change: it needs a separate marketing-consent flag (`newsletter_consent` meta, 1 only when the optional newsletter box is ticked; the flag and the export filter on it exist since the Task 4b review), the confirmed-only export filtered on it (done), a second, optional newsletter tick on the card next to a required "send me the link to read" tick, a consent upgrade recorded only at confirm time (so a stranger cannot opt someone in), and the gate still keyed on `confirmed` status. The legal decision stays the owner's. (Corrected after the Task 4b review.)
**Files:** Create `includes/reader-gate.php`, `includes/reader-cookie.php`, `includes/reader-link.php`, `themes/ideatoapps/parts/gate-card.php`; Modify `includes/newsletter-page.php` (confirm sets cookie), `includes/meta-boxes.php` or new `includes/post-gate-box.php`, `single.php`, `includes/blog-installer.php`; Tests `site/tests/php/ReaderGateTest.php`, `site/tests/e2e/reader-gate.spec.ts`.
- [ ] Failing tests: non-subscriber sees only the teaser and the HTML contains none of the gated text (grep the response); pending/unsubscribed/erased subscriber is locked; tampered/expired cookie rejected (hash_equals); confirm sets the cookie only on the POST that confirms; reading-link request answers identically for known and unknown addresses; gating off while the newsletter switch is off; gated page sends `Cache-Control: private`; JSON-LD paywall markup present.
- [ ] Mutation-check cookie verification, status re-check and "no gated text in HTML". Commit.

### Task 4c: Human review gate and honest labelling (plugin + theme)
**Owner request:** the posts must be monitored, changed and curated by a person.
**Rulings:**
- Ruling: the articles are AI-drafted and the site says so. Byline on every post: "Drafted with AI assistance. Edited and reviewed by <reviewer name> on <date>." Never "written by a person" unless true; no fake author. (Honest labelling is the owner-safe choice and is what search engines and readers' trust reward.)
- Ruling: installer creates posts as drafts with `ita_review_status = ai_draft`. A post cannot stay published unless `ita_review_status = human_reviewed` with `ita_reviewer` (name, required) and `ita_reviewed_on` (date); otherwise a publish/schedule attempt (editor, bulk action, REST, XML-RPC) is forced back to draft with an admin notice. Capability: `publish_posts` holders only; the reviewer name is entered by the human, never prefilled.
- Ruling: editor box "Editorial review" shows the sign-off checklist (all boxes required to mark reviewed): facts and claims checked against sources; examples tried or reworked; intro and examples rewritten or edited in the reviewer's own words; prompts tested in a real assistant; quiz answers correct; links and images checked; no invented stories/statistics. It also lists the article's `check` items (each writer must list the factual claims that most need verifying).
- Ruling: editing the content of a reviewed post after sign-off resets it to `needs_review` (hash check) so changes are never published unreviewed; typo-sized edits can be re-signed in one click.
- Ruling: admin list gets a "Review" column and filter (AI draft / needs review / reviewed) and a count in the dashboard so the owner can see progress through the 50.
**Files:** Create `includes/blog-review.php`, `includes/blog-review-box.php`, `includes/blog-review-gate.php`; Modify `single.php`/`post-extras.php` (byline), `blog-installer.php` (status + hash), article header (`check` list); Tests `site/tests/php/BlogReviewTest.php`, `site/tests/e2e/blog-review.spec.ts`.
- [ ] Failing tests: unreviewed post forced back to draft via every path; reviewed requires name + date + all checklist boxes; edit after sign-off resets status; byline text accurate for each status; `check` items shown in the box; reviewer text escaped.
- [ ] Mutation-check the publish guard on each path. Commit.
Content lint addition: every article header has 3-6 `check` items naming concrete claims to verify.

### Task 5: Style guide, content lint, three sample articles
**Files:** Create `site/docs/BLOG_STYLE_GUIDE.md`, `site/wp-content/plugins/ideatoapps-core/content/articles/{01,09,27}-*.html`; Test `site/tests/php/BlogContentLintTest.php`.
- [ ] Failing lint test over every article file: valid header; word count 700-1,300; excerpt <= 160 chars; exactly one quiz with 3 questions; >= 1 `ita_prompt` or `ita_checklist`; ends with a "Try it" heading; `reviewed` date valid; no email address; no first-person experience claims ("in my experience", "I tested", "we tested", "our users"); no currency amounts or "best model" style superlatives; all shortcodes parse.
- [ ] Write the style guide (plain voice, short sentences, concrete examples, what is banned and why) and the three samples as the reference quality bar.
- [ ] Review the samples with a fresh reviewer for accuracy and voice before any batch starts. Commit.

### Task 5b: Reader coverage (owner: "make sure it covers all type of readers")
**Rulings:**
- Ruling: every article carries a `level` (beginner | intermediate | advanced) and one to three `audiences` from a fixed list: beginners, students, teachers-and-tutors, parents-and-families, workers-and-business-owners, creators, builders (developers and technical readers). Accessibility and plain language are cross-cutting rules for ALL articles, not an audience.
- Ruling: target mix (50 posts): beginner >= 22, intermediate >= 14, advanced >= 6; audience counts at least: beginners 20, students 8, teachers-and-tutors 4, parents-and-families 3, workers-and-business-owners 8, creators 4, builders 10. Each of the six categories has at least one beginner and one intermediate article.
- Ruling: five topics are swapped for coverage (hero/topics/figure references updated): #3 "A short history of AI" -> "AI and accessibility: tools that help" (category safety-and-judgment... keep category ai-basics), #7 "Choosing an AI assistant" -> "Using AI when English isn't your first language" (ai-basics), #13 "Rewrite, don't restart" -> "System prompts and structured output for builders" (prompting), #26 "Reading a model comparison without being fooled" -> "RAG: how an AI looks things up" (llms), #50 "Is an AI tool worth paying for" -> "An AI-use policy for a small team" (safety-and-judgment). Slugs keep their NN numbers with new title slugs. No claims about specific products or prices (the style guide still applies).
- Ruling: plain-language rules for all readers: every article opens with a one-line "Who this is for" (generated from the audiences), defines jargon at first use, readability lint (Flesch reading ease >= 60 for beginner, >= 50 intermediate, >= 40 advanced, computed on visible text with a simple documented formula), short paragraphs, no idioms that translate badly, figures with alt text, quizzes keyboard-operable. Advanced posts may use code-style examples inside prompt boxes (no external links).
- Ruling: UI: the post meta shows a level badge and audience chips; the blog index gets a Level filter (chips like the category chips; `?level=` sanitised against the three values, combines with cat and q, noindex like q views); cards show the level.
**Files:** Modify content/topics.json (new fields level, audiences; the five swaps), blog-article-file.php (parse + validate level/audiences, cross-check with topics.json), blog-installer.php (meta ita_level, ita_audiences), theme post-article.php/card.php/blog-filters.php/blog-query.php (+ CSS), heroes regenerate, tests BlogContentLintTest (coverage matrix + readability), BlogQueryTest, e2e content.spec.ts Blog block, articles 01/09/27 headers (add level/audiences, "Who this is for" is rendered by the theme, not typed).
- [ ] Failing tests first: parser rejects unknown level/audience or mismatch with topics.json; coverage matrix lint (counts above, over topics.json so it can run before all articles exist) fails on a skewed fixture; readability lint self-test; level filter sanitising (array, unknown value, case) and combination with cat/q/pagination; badge/chips render escaped.
- [ ] Mutation-check the coverage lint and the level whitelist. Commit.

### Tasks 6-10: Articles in batches of ten (1-10 first etc.: 01-10, 11-20, 21-30, 31-40, 41-50)
Each batch: one writer subagent per batch (files only, no commits) from the style guide and topic list; lint test must pass; then two parallel reviewers: (a) factual accuracy and stale claims, (b) voice, invented claims and shortcode use. Fix loop on findings; controller commits one commit per batch.
- [ ] Per batch: write, lint green, accuracy review, voice review, fixes, commit.

### Task 11: Docs, whole-branch review, full gate
**Files:** Modify `site/docs/ADMIN_GUIDE.md`, `DEPLOYMENT_BLUEHOST.md` (install step), `DECISIONS.md`; ledger section "AI blog".
- [ ] Docs: how to install starter articles, read drafts, bulk-publish; Last reviewed policy; how to add an article.
- [ ] Final whole-branch review on the strongest model; fix wave.
- [ ] Full PHPUnit, full Playwright e2e (about an hour), `php -l`, rebuild zips. Report; ask for "push".

## Then (separate plan, already approved as design): "Ask about ClipForge" search helper, which also indexes these articles.
