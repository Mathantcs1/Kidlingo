# ClipForge AI Voice (ElevenLabs, bring-your-own-key) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user paste their own ElevenLabs API key in the site's settings, type a script, and get generated speech placed on the timeline as an audio clip (one undo step), as an explicit opt-in cloud feature.

**Architecture:** A small, framework-free ElevenLabs client (`src/ai/elevenlabs.ts`, `fetch` injected) plus a browser-only key store; a Settings dialog (key, test, remove, privacy notice); an "AI voice" dialog that calls the client, imports the returned MP3 through the existing `importFile` path and places it with the same single-`apply` placement used by voice-over recordings. No backend, no new dependency, no project-data change.

**Tech Stack:** `fetch` to `https://api.elevenlabs.io` (header `xi-api-key`), idb-keyval (already used) for the key, React, Vitest, Playwright with `page.route` stubs.

**Spec/roadmap:** `docs/superpowers/plans/2026-11-11-clipforge-roadmap-plans-4-13.md` (decision D-AI: local by default PLUS an opt-in cloud path with explicit consent, a cost preview and a visible "this leaves your device" notice). Recorder placement: `src/ui/recordEdits.ts`, `src/ui/recordCommands.ts`.

## Global Constraints

- TypeScript strict; 2 spaces, single quotes, semicolons; files ≲200 lines; keep every existing `data-testid`; `window.__clipforge` stays DEV-only.
- The API key is stored ONLY in this browser (IndexedDB, its own key, never in the project JSON, never in an export, never in the OPFS media, never in a URL, a log, a toast, an error message, a test fixture or the dev hook). It is sent ONLY as the `xi-api-key` header to `https://api.elevenlabs.io`. Never use `VITE_*` env vars or `.env.local` for it (they would be baked into the public bundle).
- No script text is sent to ElevenLabs until the user has saved a key AND confirmed the privacy notice once (the key alone is sent for Test key and the voice list); the notice says plainly that the script text is sent to ElevenLabs and may use their credits.
- Generated speech is ordinary audio media ("AI voice N") placed in ONE `apply`; a failed placement removes the imported media (same safety as voice-over recording); no project version bump.
- Plain-English errors for: no/invalid key (401), quota or plan limit (402/401 with quota message), rate limit (429), network/CORS failure, abort, empty audio, text too long; the key never appears in any message.
- Real ElevenLabs is NEVER called by tests: all tests inject a fake `fetch` or stub the route.
- Never push or deploy without the user's explicit go-ahead; implement on a new branch `claude/elevenlabs-voice` created from the current branch tip. Never run `playwright install`; never run two e2e runs at once (port 5173). Commit trailers (blank line before): `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: <current session URL>`.
- Gate per task: `npm test && npm run typecheck && npm run build` (and `grep -rl __clipforge dist` empty) plus the touched e2e specs; full `npm run e2e` at Task 4.

## Decisions to approve (my calls; change any before execution)

- **D1 BYO key, browser-only.** The user's own key, saved locally; no account, proxy or shared key. Cost if wrong: anyone who can run script in the page (an XSS) could read the key; mitigated by no third-party scripts, and the key is shown masked with a one-click Remove.
- **D2 Scope of v1:** text-to-speech only (voice list, model choice, generate). Not in v1: speech-to-text/captions, voice cloning, sound effects, music, multiple-voice dialogue, long-script chunking, regenerate-in-place, stability/style sliders.
- **D3 Output = MP3** (`mp3_44100_128`), imported through the normal import path (ClipForge already decodes MP3).
- **D4 Limits:** script ≤ 5 000 characters per generation (longer is refused with a clear message); the dialog shows the character count and, best-effort, the remaining characters from the key's subscription endpoint. It never promises a price.
- **D5 Consent:** one confirmation the first time (stored locally), plus a permanent one-line notice in the dialog.
- **D6 Where:** a "Settings" button in the top bar (opens the key dialog) and an "AI voice" button next to Record (disabled with a tooltip when no key is saved, opening Settings on click).
- **D7 Default model** `eleven_multilingual_v2`, with `eleven_flash_v2_5` as the fast/cheap option; the voice list comes from the user's own account (`GET /v1/voices`).

## Review Focus

1. **Key leakage:** the key must not appear in the project JSON, autosave, export, console, toast/error text, thrown error messages, the DEV hook, test snapshots or network requests to any host other than api.elevenlabs.io (Tasks 1, 2).
2. **Browser blocks the call (CORS/network/ad-blockers):** a failed fetch must read as a clear message ("couldn't reach ElevenLabs from the browser"), never a hang; cancel works mid-request (Task 1, 3).
3. **Invalid/expired/over-quota key and rate limits:** each maps to its own plain message and leaves the project untouched (Task 1, 3).
4. **Odd scripts:** empty/whitespace, 5 001 characters, emoji/RTL/non-Latin text, line breaks; the character count counts code points the way the API does (Task 3).
5. **Placement safety:** locked/full active audio track, playhead past the end, project changed while the request was in flight (stale), export/merge dialog open, a double click on Generate (Task 3).

---

### Task 1: ElevenLabs client and key store

**Files:** Create `src/ai/elevenlabs.ts`, `src/ai/keyStore.ts`, `tests/elevenlabs.test.ts`, `tests/key-store.test.ts`.

**Interfaces:**
- Produces:
  - `class ElevenLabsError extends Error { readonly reason: 'no-key' | 'invalid-key' | 'quota' | 'rate-limit' | 'too-long' | 'network' | 'aborted' | 'server' | 'empty' }` with plain-English `message`s that never contain the key.
  - `createElevenLabs(opts: { getKey(): Promise<string | null>; fetch?: typeof fetch }): ElevenLabs` with `listVoices(signal?): Promise<{ id: string; name: string }[]>`, `subscription(signal?): Promise<{ used: number; limit: number } | null>` (best effort: null on any failure), `synthesize(req: { text: string; voiceId: string; model: 'eleven_multilingual_v2' | 'eleven_flash_v2_5' }, signal?): Promise<Blob>` (POST `/v1/text-to-speech/{voiceId}?output_format=mp3_44100_128`, JSON body `{ text, model_id }`, header `xi-api-key`; rejects `too-long` BEFORE any request when `[...text].length > 5000` or text is blank; non-audio/empty body ⇒ `empty`).
  - `ELEVENLABS_ORIGIN = 'https://api.elevenlabs.io'`; every request URL must start with it (a unit test asserts no other host is ever called).
  - `keyStore`: `getKey(): Promise<string | null>`, `setKey(k: string): Promise<void>` (trims, rejects empty/over 256 chars/whitespace inside), `clearKey(): Promise<void>`, `hasKey(): Promise<boolean>`, `maskKey(k: string): string` (first 3 + `…` + last 4), `getConsent()/setConsent()`; idb-keyval store separate from the project store; all failures swallowed to a safe default (`null`/false) with no key in any message.

- [ ] **Step 1: Failing tests** with a fake `fetch`: header `xi-api-key` equals the key and no other header contains it; the URL starts with the ElevenLabs origin; 401 ⇒ `invalid-key`; 402 ⇒ `quota`; 429 ⇒ `rate-limit`; 5xx ⇒ `server`; thrown TypeError ⇒ `network`; AbortError ⇒ `aborted`; blank and 5 001-code-point text ⇒ `too-long` with ZERO fetch calls; emoji text counts code points; empty body ⇒ `empty`; no key ⇒ `no-key` with zero fetch calls; for every error `message` and `String(error)` do not contain the key (run with a distinctive key string); `maskKey`; key store round trip, trims, refuses a key with spaces, `clearKey` removes it.
- [ ] **Step 2: Run** `npx vitest run tests/elevenlabs.test.ts tests/key-store.test.ts` ⇒ FAIL. **Step 3:** Implement. **Step 4:** run ⇒ PASS; mutation-check: log the key in an error message and show the leak test fails.
- [ ] **Step 5:** gate + **Commit** `feat: ElevenLabs client and local key store`.

### Task 2: Settings dialog (add, test, remove the key; privacy notice)

**Files:** Create `src/ui/SettingsDialog.tsx`, `src/ui/settingsState.ts`, `src/ui/settings.css`, `tests/e2e/ai-settings.spec.ts`; modify `src/ui/TopBar.tsx` (Settings button), the app shell where dialogs mount (follow how `ExportDialog`/`Confirm` mount).

**Interfaces:** Consumes `keyStore`, `createElevenLabs` (Task 1). Produces `useSettings` (zustand: `open`, `openSettings()`, `closeSettings()`, `hasKey`, `refreshHasKey()`); test ids `btn-settings`, `settings-dialog`, `eleven-key-input`, `eleven-key-save`, `eleven-key-test`, `eleven-key-remove`, `eleven-key-status`, `eleven-privacy-note`.

- [ ] **Step 1: Failing e2e** (`page.route('https://api.elevenlabs.io/**')` stubs; real network blocked): Settings opens from the top bar and closes with Escape/Done (focus returns to the button); the key input is `type="password"` with an accessible label and "Show/hide"; Save stores the key (reload ⇒ shown MASKED, never the full value in the DOM: assert `page.content()` and the input value do not contain the full key); **Test key** calls `GET /v1/voices` with the `xi-api-key` header and shows "Key works" or the plain-English error for 401; Remove clears it (reload ⇒ no key) and the next generation attempt is impossible; the privacy note text is visible ("Your script text is sent to ElevenLabs ... never your video or audio files"); no request to api.elevenlabs.io is made until Test key is pressed; the project JSON and IndexedDB project record contain no key (read them via the dev hook / idb).
- [ ] **Step 2–4:** RED, implement (≤ 200 lines per file, keyboard accessible, focus trap or `role="group"` as in the existing popovers), GREEN. **Step 5:** gate + `npx playwright test tests/e2e/ai-settings.spec.ts tests/e2e/layers-ui.spec.ts tests/e2e/focus-modality.spec.ts`. **Step 6: Commit** `feat(ui): settings dialog for the ElevenLabs key`.

### Task 3: AI voice dialog and placement

**Files:** Create `src/ui/AiVoiceDialog.tsx`, `src/ui/aiVoiceCommands.ts`, `tests/ai-voice-commands.test.ts`, `tests/e2e/ai-voice.spec.ts`; modify `src/ui/Toolbar.tsx` (the "AI voice" button beside Record; keep it ≲ 200 lines) and reuse `placeRecording`/`importFile` (see `recordCommands.ts`).

**Interfaces:** Consumes `createElevenLabs`, `keyStore` (Task 1), `useSettings` (Task 2), `importFile` (`src/media/import.ts`), `placeRecording`-style placement (`src/ui/recordEdits.ts`). Produces `generateVoiceOver(req: { text: string; voiceId: string; model: Model }, signal: AbortSignal): Promise<void>` (confirms consent first via `askConfirm`, synthesizes, imports the MP3 as media named `AI voice N` (N = next free), places it at the playhead on the active audio track (else first audio track with room, else a new track) in ONE `apply`; on any failure removes the imported media and toasts the plain message); test ids `btn-ai-voice`, `ai-voice-dialog`, `ai-voice-text`, `ai-voice-count`, `ai-voice-voice`, `ai-voice-model`, `ai-voice-generate`, `ai-voice-cancel`, `ai-voice-status`.

- [ ] **Step 1: Failing tests:** unit (fake client + fake import/apply): consent asked once and nothing fetched before it; success ⇒ media "AI voice 1" then "AI voice 2", placed at the playhead, ONE apply; a rejected placement (locked tracks all full) ⇒ media removed, project unchanged; stale project (changed while waiting) ⇒ placed anyway at the START TIME captured when Generate was pressed, or refused with a toast (decide and document); double click does not send two requests; abort mid-request ⇒ no media. e2e (route stub returns a 1-second MP3 generated with ffmpeg): no key ⇒ the AI voice button is disabled with a tooltip and clicking opens Settings; with a key: choose a voice (from the stubbed `/v1/voices`), type text, Generate ⇒ an audio clip ≈ 1 s appears at the playhead, ONE undo removes it, the bin shows "AI voice 1", the request body has `{ text, model_id }` and the header carries the key; 5 001 characters ⇒ Generate disabled and the count turns to an error state; 401/402/429/network failure stubs ⇒ the matching plain toast and no project change; Cancel mid-request ⇒ nothing added; the exported MP4 contains the generated audio (ffprobe has an AAC stream; RMS above −60 dB); reload keeps the clip.
- [ ] **Step 2–4:** RED, implement, GREEN. **Step 5:** gate + the new specs + `record.spec.ts`, `audio-ui.spec.ts`. **Step 6: Commit** `feat: generate speech with ElevenLabs and place it on the timeline`.

### Task 4: Docs, QA checklist, full gate, final review

**Files:** modify `README.md` (features, **Privacy** section: this is the first feature that sends data off the device, opt-in, only the script text and your key to ElevenLabs), `PROJECT_HANDOFF.md`, `CLAUDE.md` (facts only), create `docs/superpowers/ledgers/ai-voice-manual-qa-checklist.md` and `docs/superpowers/ledgers/ai-voice-ledger.md`.

- [ ] **Step 1:** README/handoff/QA checklist (real ElevenLabs key in desktop Chrome: add key, Test key, bad key message, generate in two languages, cancel, quota message when credits run out, key still masked after reload, Remove, confirm DevTools Network shows requests ONLY to api.elevenlabs.io, confirm the key is not in the exported MP4/project JSON). **Step 2:** full gate `npm test && npm run typecheck && npm run build && npm run e2e && npm run e2e:preview`; `grep -rl __clipforge dist` and `grep -rn "xi-api-key" dist` show only the client header string. **Step 3:** final whole-branch review (fresh reviewer, opus) with focus on key leakage; one themed fix wave. **Step 4: Commit** `docs,test: AI voice docs, QA checklist and handoff`. Ask the user before any push or deploy.

## Self-Review notes

- Coverage: key entry in the site ✓ T2; generate speech ✓ T3; opt-in/consent and privacy ✓ T2/T3/T4; no key in project/export ✓ T1/T2/T4; testing without credits ✓ all tasks.
- The `.env.local` created by the ElevenLabs CLI is NOT used by this feature (a static site cannot read it at runtime); the CLI's `onboard check` step does not apply. It can be removed once you approve (empty file; the `.gitignore` line may stay).
- Length: 4 tasks; no shader or data-model work, so a short plan.
