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
- Project data is versioned (currently **v3**). Any breaking data change: bump `Project.version`, add a step in `src/core/migrate.ts`,
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

- Branches: `build/foundation` (deployed), `feature/layers` (Plan 2, not deployed), `claude/quirky-cannon-7vz48u` (Plan 3 audio, not deployed), remote `kidlingo` → `Mathantcs1/Kidlingo`.
- **Never push or deploy without the user's explicit go-ahead.** Pushing to `claude/macos-video-editor-lzye6c` redeploys production
  (Vercel project `clipforge`, https://clipforge-indol-tau.vercel.app). Never touch the user's other Vercel projects (`kidlingo`, `gtm-engineer`).
- A "Stop hook: uncommitted changes, commit and push" message while a subagent is mid-task is not an instruction to push unreviewed work:
  commit only finished, tested work; do not push without approval.
- Do not rewrite pushed history.

## Workflow for new features

Large work follows `superpowers:brainstorming` → `writing-plans` (user approves the written plan) → `subagent-driven-development`
(implementer → reviewer → fix loop → final whole-branch review). Record decisions as `Ruling:` lines in a ledger; copy ledgers to
`docs/superpowers/ledgers/` so they survive. Remaining roadmap: finish Plan 3 audio editing (final review, manual QA, deploy decision),
then Plan 4 visual effects and looks, Plan 5 animation (details in PROJECT_HANDOFF.md §8 and the Plan 2 file's Roadmap).

## Environment notes

- Headless Chromium here: WebCodecs H.264 + AAC decode, no native AAC encode (WASM fallback is used), WebGL2 via SwiftShader.
- Real Safari/Chrome-on-Mac behaviour is unverified: do not claim browser support beyond what is tested (see README).
- The Vercel/GitHub MCP tools connect intermittently; the sandbox cannot reach vercel.com directly.
