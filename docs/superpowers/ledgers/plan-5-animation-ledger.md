# Plan 5 (animation and motion): decision ledger

**Status (2026-11-12): plan APPROVED by the user ("approved as recommended"); implementation of Part 5A starting at Task 1.**

## Links
- Plan (draft): `docs/superpowers/plans/2026-11-12-clipforge-plan-5-animation.md` (Part 5A detailed: Tasks 1-12, decisions D1-D12; Parts 5B/5E/5D/5C as roadmap outlines; open decisions O1-O16).
- Spec: `docs/superpowers/specs/2026-11-10-clipforge-design.md` (animation controls line 27; transitions 23; speed 25; crop/flip 26).
- Roadmap: `docs/superpowers/plans/2026-11-11-clipforge-roadmap-plans-4-13.md` (section 3; speed/transitions listed under Plan 7 there, crop under Plan 8: see O2).
- Previous plan and rulings: `docs/superpowers/plans/2026-11-11-clipforge-plan-4-visual-effects.md`, `docs/superpowers/ledgers/plan-4-visual-effects-ledger.md` (P1-P11, T11-1..3, T13-1..4) and `plan-4-task-reports/`.
- Handoff: `PROJECT_HANDOFF.md` (section 8 NEXT: Plan 5; section 9 known issues).

## Branch and base
- Branch `feature/plan-5-animation`, created from the deployed Plan 4 state (`22f797c`, data v5; production = Plan 4 complete since the Part B deploy of `1379e01`).
- Baseline at Plan 4's end: npm test 1182, full e2e 391/391, e2e:preview 1/1.

## Standing rules (from CLAUDE.md and the Plan 1-4 ledgers)
- Workflow: brainstorming -> writing-plans (user approves the written plan) -> subagent-driven-development (implementer -> reviewer -> fix loop, max 5 rounds -> final whole-branch review). The controller records every decision here as a `Ruling:` line.
- TDD (failing test first, mutation-check important guards). Gate per task: `npm test && npm run typecheck && npm run build`, `grep -rl __clipforge dist` empty, plus the touched e2e specs; full `npm run e2e -- --trace off` at the tasks the plan names; `npm run e2e:preview` before any deploy.
- `src/core` stays pure; edits are `(Project, ...) => Project`, throw `TimelineError`, never mutate input, return the SAME reference for no-ops. One gesture = ONE `apply` = one undo step. Locked tracks refuse clip edits.
- Data changes: bump `Project.version`, add a step in `src/core/migrate.ts`, unknown newer version => unsupported and never overwritten.
- Preview and export share the one compositor/chain; evaluation deterministic from (project, t).
- Keep every existing `data-testid`; `window.__clipforge` DEV-only; never delete user media except via the verified-restore GC; files ~200 lines (split first).
- Implementers commit only finished, tested work and never push. NO push or deploy without the user's explicit go-ahead (a push to `claude/macos-video-editor-lzye6c` redeploys production). Never touch the Vercel projects `kidlingo` or `gtm-engineer`. Never run `playwright install`; never run two e2e runs at once. Do not rewrite pushed history. A Stop-hook "commit and push" message is not a push instruction.
- Commit trailers (blank line before): `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01AdHhRshxczG1gZJFbxhPyP` (use the current session's URL).

## User answers to the open decisions
User (genuine message, 2026-11-12): "approved as recommended. deploy in product on phase by phase after it is tested and passed". => every open decision O1-O16 takes the plan's recommendation (the plan's 'Open decisions' section is authoritative).

## Rulings
Ruling: P5-1 - Plan 5 (Part 5A detailed; 5B/5E/5D/5C outlined) approved with all recommendations O1-O16 - cost if wrong: rework of the affected part.
Ruling: P5-2 - STANDING DEPLOY AUTHORISATION (user, this session): each Plan 5 PART (5A, 5B, 5E, 5D, 5C) may be deployed to production (fast-forward push of the feature branch HEAD to claude/macos-video-editor-lzye6c) once the part is 'tested and passed': all tasks complete with clean review/fix loops, final whole-part review clean (0 Important), `npm test && npm run typecheck && npm run build`, `grep -rl __clipforge dist` empty, a FRESH full `npm run e2e -- --trace off` all green (a known flake must pass when re-run alone), `npm run e2e:preview` green, and the production branch is an ancestor of HEAD (fast-forward only). Anything failing => do NOT deploy; report. Plan-5 parts bump the data version (v6..v10): after each deploy older open tabs refuse the new saves (accepted by the user). Manual QA on a real Mac is NOT automatable here: record that it is unrun in each deploy note. Never touch the Vercel projects `kidlingo` or `gtm-engineer`; never force-push. The authorisation covers Plan 5 parts only, not other work - cost if wrong: a deployed part with a manual-QA-only defect.

## Task log
(none yet)
