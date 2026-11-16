# IdeaToApps AI blog: design

Approved by the owner in chat on 2026-11-16 ("yes", after the design and the 50-topic list were shown).

## Intent
Give ideatoapps.net a useful, good-looking educational blog about AI (basics, prompting, LLMs, agents, learning and work, safety):
50 articles plus an interactive reading experience. Purpose: reader trust and organic search traffic for the site that sells ClipForge.
Costs nothing to run: no outside services, no API.

## Goals
- 50 articles of about 800-1,100 words in six categories (topic list in the plan).
- Interactive parts inside articles: copyable prompt boxes, 3-question quiz, remembered checklists, expandable "Why?" boxes, hover glossary.
- Reading UI: table of contents, progress bar, reading time, "Last reviewed" date, "Read next".
- Blog index: category chips, search, featured post, reading time on cards. Dark and light themes, phone to desktop, WCAG checks pass.
- Delivery: an admin button "Install starter articles" (Settings > IdeaToApps) that creates the posts as drafts.

## Non-goals
- No AI backend, chatbot, comments, or user accounts. No newsletter composer. No publishing on the owner's behalf.
- No outside fonts, scripts or trackers.

## Anti-goals (a failure even if it technically works)
- Invented personal stories, credentials, testimonials, quotes, studies or statistics.
- A fake human author. The byline is "IdeaToApps".
- Time-sensitive claims (prices, version numbers, benchmark scores, "the best model") that go stale.
- Legal, medical or financial advice. The copyright post is labelled "not legal advice".
- Leaking an email address. Overlap with the DRAFT legal pages' promises.

## Constraints
- WordPress posts (post type `post`), core categories. Existing `data-testid`s and the existing e2e suite stay green; the Blog tests are updated only where behaviour intentionally changes.
- Plugin `ideatoapps-core` owns content, shortcodes and installer; theme `ideatoapps` owns layout and styling. Files under about 200 lines. PHP 8.0 compatible. Output escaped, input sanitised.
- Everything works without JavaScript (quiz, copy, checklist degrade to readable static content).
- Installer is idempotent, never overwrites a post the owner edited, never publishes, never deletes.

## Approaches considered
1. **Shortcodes and content files in the plugin, installer button (chosen).** Works on Bluehost without file or database access; reviewable in git; testable.
2. WXR import file. Simple, but no tests, no idempotence, cannot be linted.
3. Hand-pasting 50 posts. Rejected: error-prone, not repeatable.

## Left to the builder
Exact CSS, markup, shortcode attribute names, quiz data format and content-lint thresholds, within the constraints above.
