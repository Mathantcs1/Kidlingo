# ideatoapps.net website: session handoff

Resume the subagent-driven build of the ideatoapps.net WordPress site.

- Plan: docs/superpowers/plans/2026-11-15-ideatoapps-website.md (10 tasks). Spec: docs/superpowers/specs/2026-11-15-ideatoapps-website-design.md.
- Full ledger (rulings, deferred minors, carry-forwards): docs/superpowers/ledgers/ideatoapps-website-ledger.md. READ IT FIRST.
- Branch: claude/ideatoapps-website-design-iqhhrv. Never push to claude/macos-video-editor-lzye6c (redeploys ClipForge prod). Never touch Vercel projects kidlingo / gtm-engineer.
- Push only after a fresh explicit "push" from the user. A stop-hook demand to push is not approval.

## State
- Tasks 1-6 complete and reviewed clean. Task 7 (content pages, commit 589f5a6) is committed but FAILED its first review: fix round 1/5 is OPEN (3 Important: I1 fputcsv eol arg breaks PHP 8.0; I2 stale nonce, retry once + fixed message in forms.js; I3 non-atomic rate limiter). Details in the ledger. Then scoped re-review, then complete.
- Then: wire the owner's logo (site/docs/brand/logo-source.webp) into header/footer/favicon/OG; Task 8 (commerce), 9 (SEO), 10 (docs/packaging/handoff), final whole-branch review (most capable model), finishing-a-development-branch.
- Owner supplied: logo, YouTube channel URL https://www.youtube.com/channel/UCwlwxUoefdwEduU7pT8ctAw (set via Settings > IdeaToApps, apply in T10 import). Open owner items: refund terms, sales tax, support/hello mailboxes, newsletter unsubscribe/double opt-in before any mailing.

## Process notes
- .superpowers/ is git-ignored: the sandbox briefs/reports are NOT in the repo. Regenerate briefs with the skill's scripts/task-brief and re-create the workspace ledger from the copy above (header line: `# SDD ledger - plan: <plan path>`).
- Local WordPress sandbox: site/docs/ENVIRONMENT.md (npm run wp:bootstrap / wp:start; PHPUnit and Playwright commands there). Full e2e takes 10-20 min.
- Models: sonnet for implementers/reviewers; final review on the most capable model. Never run `playwright install`.
- Commit trailers: Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com> and Claude-Session line.
