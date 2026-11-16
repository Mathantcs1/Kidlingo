# IdeaToApps AI Blog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** 50 reviewed AI-education articles with an interactive reading UI, installable as drafts from wp-admin.

**Architecture:** Plugin `ideatoapps-core` holds the shortcodes, content files (`content/articles/NN-slug.html`) and the installer; theme `ideatoapps` holds single-post, blog-index and card styling. Everything degrades without JavaScript.

**Tech Stack:** PHP 8.0, WordPress core posts and categories, vanilla JS/CSS (no new dependencies), PHPUnit, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-16-ideatoapps-ai-blog-design.md`

## Global Constraints
- Byline "IdeaToApps"; no invented anecdotes, credentials, testimonials, quotes, studies, statistics; no stale facts (prices, versions, benchmarks); no email addresses; no legal/medical/financial advice.
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

### Task 5: Style guide, content lint, three sample articles
**Files:** Create `site/docs/BLOG_STYLE_GUIDE.md`, `site/wp-content/plugins/ideatoapps-core/content/articles/{01,09,27}-*.html`; Test `site/tests/php/BlogContentLintTest.php`.
- [ ] Failing lint test over every article file: valid header; word count 700-1,300; excerpt <= 160 chars; exactly one quiz with 3 questions; >= 1 `ita_prompt` or `ita_checklist`; ends with a "Try it" heading; `reviewed` date valid; no email address; no first-person experience claims ("in my experience", "I tested", "we tested", "our users"); no currency amounts or "best model" style superlatives; all shortcodes parse.
- [ ] Write the style guide (plain voice, short sentences, concrete examples, what is banned and why) and the three samples as the reference quality bar.
- [ ] Review the samples with a fresh reviewer for accuracy and voice before any batch starts. Commit.

### Tasks 6-10: Articles in batches of ten (1-10 first etc.: 01-10, 11-20, 21-30, 31-40, 41-50)
Each batch: one writer subagent per batch (files only, no commits) from the style guide and topic list; lint test must pass; then two parallel reviewers: (a) factual accuracy and stale claims, (b) voice, invented claims and shortcode use. Fix loop on findings; controller commits one commit per batch.
- [ ] Per batch: write, lint green, accuracy review, voice review, fixes, commit.

### Task 11: Docs, whole-branch review, full gate
**Files:** Modify `site/docs/ADMIN_GUIDE.md`, `DEPLOYMENT_BLUEHOST.md` (install step), `DECISIONS.md`; ledger section "AI blog".
- [ ] Docs: how to install starter articles, read drafts, bulk-publish; Last reviewed policy; how to add an article.
- [ ] Final whole-branch review on the strongest model; fix wave.
- [ ] Full PHPUnit, full Playwright e2e (about an hour), `php -l`, rebuild zips. Report; ask for "push".

## Then (separate plan, already approved as design): "Ask about ClipForge" search helper, which also indexes these articles.
