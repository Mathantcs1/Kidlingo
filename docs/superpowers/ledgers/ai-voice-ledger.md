# AI voice ledger (ElevenLabs, bring-your-own key)

Plan: `docs/superpowers/plans/2026-11-15-clipforge-elevenlabs-voice.md`. Branch `claude/elevenlabs-voice` (from `claude/quirky-cannon-7vz48u` at `93e4795`). User approved the plan on 2026-11-15. NOT pushed, NOT deployed: needs the user's explicit go-ahead (the Plan 4 push authorisation does not cover this branch).
Copied from the git-ignored `.superpowers/sdd/2026-11-15-clipforge-elevenlabs-voice/progress.md`.

## Decisions
- D1 BYO key, browser-only: the user's own key saved locally; no account, proxy or shared key. Risk: script running in the page could read the key; mitigated by no third-party scripts, masked display and one-click Remove.
- D2 Scope v1: text-to-speech only (voice list, model choice, generate). Not in v1: speech-to-text/captions, cloning, sound effects, music, multi-voice dialogue, chunking of long scripts, regenerate-in-place, stability/style sliders.
- D3 Output MP3 (`mp3_44100_128`) through the normal import path.
- D4 Script <= 5 000 characters (code points); dialog shows the count and, best effort, remaining characters; never promises a price.
- D5 Consent: one confirmation the first time (stored locally) plus a permanent notice in the dialog.
- D6 Settings button in the top bar; AI voice button beside Record (disabled with tooltip and opening Settings when no key).
- D7 Default model `eleven_multilingual_v2`, fast option `eleven_flash_v2_5`; voices from `GET /v1/voices`.

## Rulings
Ruling: P1 — Models: sonnet implementers for T1-T3; task reviewers opus for T1 (key-leak security) and T3 (placement/consent), sonnet for T2; final review opus.
Ruling: P2 — If the project changed while the synthesis request was in flight, the clip is placed at the START TIME captured when Generate was pressed, refused only if placement is impossible; the media is removed on any placement failure.
Ruling: P3 — The empty `.env.local` created by the ElevenLabs CLI is not used; left alone (untracked, ignored) until the user says to delete it.
Ruling: T4a — The key itself (no script text) is sent to api.elevenlabs.io when the user presses Test key or opens the AI voice dialog (voice list); script text is sent only after consent. The plan constraint now reads "no script text before consent".
Ruling: T4b — Consent is stored per browser, not per key; only Remove in Settings resets it.
Ruling: T2 no show/hide toggle on the key input (password only, never revealable) so the key stays unexposed.

## Task outcomes
- Task 1 (client + key store): `df57840`, fixes `be33cd5`. 47+ unit tests; mutation checks (key in error message, removed too-long pre-check) failed as they should. Fixed strings only in errors; separate IndexedDB `clipforge-ai-secrets`.
- Task 2 (Settings dialog): `b5c98b3`, fixes `6039b93` (abort on Remove/unmount, busy guards, error allow-list, focus, consent-clear test).
- Task 3 (AI voice dialog + placement): `dc6d806`, fixes `c788363` (lazy MP3 fixture cleanup, silent cancel, a11y, deflake of the lifecycle spec, voice-list error test). `generateVoiceOver` returns `Promise<boolean>`.
- Task 4 (docs, QA checklist, full gate): see the final commit `docs,test: AI voice docs, QA checklist and handoff` and `.superpowers/sdd/.../task-4-report.md` (local only).

## Open
- Never run against the real ElevenLabs API (CORS, quota response shapes unverified); run `ai-voice-manual-qa-checklist.md`.
- Final whole-branch review (opus, key-leak focus) and the push/deploy decision belong to the controller and the user.
- CLOSED: Task 4's first e2e run had 2 failures in `restore.spec.ts` (the one-shot IDB read failure was consumed by the Toolbar `hasKey()` read). Fixed in the test (`failNextRead` skips the `clipforge-ai-secrets` database); mutation-checked; no other e2e helper patches IDB reads (`session.spec.ts` patches `put`, unaffected). Full e2e now 408 passed.
- Final review fix wave: Settings button compacts to a gear (aria-label kept) at <= 800 px so the top bar fits at 700 px (`tests/e2e/topbar-fit.spec.ts`); Settings privacy note now says key and text are sent with each request.
