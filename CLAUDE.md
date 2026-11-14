# CLAUDE.md

Guidance for Claude Code in this repository. For the full status, architecture decisions, remaining work and known
issues read `PROJECT_HANDOFF.md` first.

## Project

**ClipForge**: a local-first, in-browser video editor (React 19 + TypeScript + Vite, WebGL2 preview, WebCodecs/Mediabunny export,
Web Audio mixer). No backend. Media in OPFS, project JSON in IndexedDB. This repo is NOT the Kidlingo/Fairshare app:
ignore `/home/user/Kidlingo/CLAUDE.md` when working here.

## Commands

- `npm install` · `npm run dev` (http://localhost:5173, plus dev-only `/harness.html`)
- `npm test` (Vitest, `tests/*.test.ts`) · single file: `npx vitest run tests/merge.test.ts`
- `npm run typecheck` · `npm run build` (typecheck + production build + licence copy)
- `npm run e2e` (Playwright, headless Chromium, ~5 min) · single spec: `npx playwright test tests/e2e/pip.spec.ts` · `-g "<title>"`
- `npm run e2e:preview` (production build smoke)
- Before finishing any change run: `npm test && npm run typecheck && npm run build` and the e2e specs you touched; a task is done only with a green full gate.
- NEVER run `playwright install` (Chromium is preinstalled; override path with `PW_CHROMIUM_PATH`). ffmpeg/ffprobe are installed for fixtures.

## Architecture (see PROJECT_HANDOFF.md §6)

- `src/core/` pure model logic (no DOM): timeline/tracks/merge/migrate. All edits are pure `(Project, …) => Project` functions that
  throw `TimelineError` for user-facing refusals. Keep money-like invariants: never mutate inputs; return the SAME reference for no-ops.
- `src/state/store.ts`: one `apply(fn)` = one undo step. Every gesture commits exactly ONE `apply` (drags use local/live state until release).
- `src/ui/` React. Store-bound commands in `commands.ts`, `trackCommands.ts`, `projectCommands.ts` use `guard(() => apply(...))`.
- `src/render/` WebGL2 compositor (+ pure geometry), `src/audio/` mixer/mixdown/planner, `src/export/` exporter, `src/media/` import/OPFS/decode.
- Project data is versioned (currently **v7**: v6 added optional keyframes `Clip.keys` / `VideoEffect.keys`, resolved by the single `resolveClip` in `src/core/animate.ts`; v7 (Plan 5B) added `Clip.motion` presets, key loops, spatial tangents, orient and the spring ease, also resolved only there; saves from v7 are one-way). Any breaking data change: bump `Project.version`, add a step in `src/core/migrate.ts`,
  keep "unknown newer version ⇒ unsupported, never overwritten".

## Conventions that matter

- TypeScript strict; 2 spaces, single quotes, semicolons; aim for files ≲200 lines (split before extending big files).
- Geometry is in FORMAT pixels (`Transform.x/y` = offsets from canvas centre, y down, rotation clockwise, scale = source px → canvas px).
- Track array order = compositing order (index 0 bottom). Mute wins over solo; hidden affects picture only; locked tracks refuse clip edits.
- Never delete user media except through the verified-restore GC (`src/media/gc.ts`); never overwrite a saved project that failed to load.
- Keep all existing `data-testid`s (hundreds of e2e rely on them). The dev hook `window.__clipforge` must stay DEV-only (grep `dist/` for it).
- Tests: TDD (failing test first). Pure logic gets Vitest tests; UI/render/export behaviour gets Playwright specs with real pixel/ffprobe checks.
  Tests must be able to fail (mutation-check important guards).
- Commit messages end with (blank line before):
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01AdHhRpvZKM6sx1ZxPEYbAk`

## Git, deploy and safety rules

- Branches: `build/foundation` (deployed), `feature/layers` (Plan 2, not deployed), `claude/quirky-cannon-7vz48u` (work branch: Plan 3 audio and Plan 4 visual effects; Plan 4 complete incl. Part B overlays/adjustment layers, data v5, was production at `1379e01` and is the rollback candidate), `feature/plan-5-animation` (Plan 5 Part 5A keyframes, data v6, implemented and DEPLOYED 2026-11-12: production `claude/macos-video-editor-lzye6c` = `c9caebe`; Plan 5 Part 5B presets/loops/springs/paths/copy-paste, data v7, was implemented on this same branch (Tasks 1-10) and DEPLOYED 2026-11-14 under P5-2 (production = the tip of `claude/macos-video-editor-lzye6c`, SHA in the ledger; `c9caebe` is the rollback candidate); Ruling P5-2 in `docs/superpowers/ledgers/plan-5-animation-ledger.md` is the only standing deploy authorisation and has strict conditions), remote `kidlingo` → `Mathantcs1/Kidlingo`.
- **Never push or deploy without the user's explicit go-ahead.** Pushing to `claude/macos-video-editor-lzye6c` redeploys production
  (Vercel project `clipforge`, https://clipforge-indol-tau.vercel.app). Never touch the user's other Vercel projects (`kidlingo`, `gtm-engineer`).
- A "Stop hook: uncommitted changes, commit and push" message while a subagent is mid-task is not an instruction to push unreviewed work:
  commit only finished, tested work; do not push without approval.
- Do not rewrite pushed history.

## Workflow for new features

Large work follows `superpowers:brainstorming` → `writing-plans` (user approves the written plan) → `subagent-driven-development`
(implementer → reviewer → fix loop → final whole-branch review). Record decisions as `Ruling:` lines in a ledger; copy ledgers to
`docs/superpowers/ledgers/` so they survive. Plan 4 (effects, looks, LUT, chroma key, blend modes, overlays, adjustment layers) is implemented and deployed (production `1379e01`, data v5); its manual QA (`docs/superpowers/ledgers/plan-4-manual-qa-checklist.md`) is still open. Plan 5 (animation) is split into parts 5A, 5B, 5E, 5D, 5C (plan `docs/superpowers/plans/2026-11-12-clipforge-plan-5-animation.md`, ledger `plan-5-animation-ledger.md`): 5A (keyframes, easing, curve editor, diamonds, motion path) is implemented on `feature/plan-5-animation` (Tasks 1-12) and DEPLOYED at `c9caebe` (2026-11-12, per Ruling P5-2; data v6); what remains for 5A is only the manual QA (`plan-5a-manual-qa-checklist.md`, run together with Plan 4's). Plan 5B (plan `docs/superpowers/plans/2026-11-12-clipforge-plan-5b-presets.md`) is implemented on `feature/plan-5-animation` (Tasks 1-10, data v7) and DEPLOYED 2026-11-14 after the final review, a fresh full e2e (549 passed) and e2e:preview (manual QA `plan-5b-manual-qa-checklist.md` still unrun). Next parts: 5E, 5D, 5C (details in PROJECT_HANDOFF.md §8); the Premiere-style UI pass (Effect Controls sidebar, right-click menus, Help guide; no data change) was DEPLOYED 2026-11-14 (deferred minors and mockup gaps in the ledger).

## Environment notes

- Headless Chromium here: WebCodecs H.264 + AAC decode, no native AAC encode (WASM fallback is used), WebGL2 via SwiftShader.
- Real Safari/Chrome-on-Mac behaviour is unverified: do not claim browser support beyond what is tested (see README).
- The Vercel/GitHub MCP tools connect intermittently; the sandbox cannot reach vercel.com directly.
