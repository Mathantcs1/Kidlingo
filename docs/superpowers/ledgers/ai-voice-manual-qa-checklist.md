# AI voice manual QA checklist (ElevenLabs, bring-your-own key)

Everything in the automated suite uses stubbed `api.elevenlabs.io` responses. Nothing has been run against the real API.
Run this in **desktop Chrome** with a real ElevenLabs key (a free-tier key is fine; note Chrome version, OS, plan).
Safari and other browsers are unverified: do not claim support from this list. Never paste the key into notes or tickets.

## 1. Key handling
- [ ] Settings (top bar) opens; the key field is a password field with no way to reveal it.
- [ ] Note whether the browser's password manager offers to save the key field (it should not; if it does, record the browser and tell the controller).
- [ ] Add key and Save: it shows masked (first 3 characters, then dots, last 4). No request is sent until Test key.
- [ ] **Test key** with the good key says it works (and shows remaining characters if ElevenLabs reports them).
- [ ] Test with a bad or revoked key: plain "key rejected" style message, no key text in it.
- [ ] Reload the page: the key is still saved and still masked. Open Settings again: never shown in full.
- [ ] **Remove**: key gone after reload; the AI voice button is disabled and opens Settings.

## 2. Generating
- [ ] First Generate asks for consent; Cancel there sends nothing (check Network).
- [ ] Generate in English: audio clip appears at the playhead on the audio track, bin shows "AI voice 1", plays and sounds right; one undo removes it.
- [ ] Generate in a second language (for example Spanish or Japanese, with `eleven_multilingual_v2`): correct language and pronunciation; also try `eleven_flash_v2_5`.
- [ ] Emoji, line breaks and a 5 001-character script: count shown, Generate disabled over 5 000.
- [ ] Cancel mid-request: nothing added to the bin or timeline, no error toast.
- [ ] Quota: with credits exhausted (or a nearly empty account) the message says credits ran out and the project is unchanged.
- [ ] Offline or with an ad-blocker blocking api.elevenlabs.io: a clear "couldn't reach ElevenLabs" message, no hang. Note whether the real API's CORS allows the browser call at all.
- [ ] Locked audio track at the playhead: clip goes to another or a new audio track; a refused placement removes the media.

## 3. Privacy and leakage
- [ ] DevTools Network during a full session (Test key, voices, generate): requests go ONLY to `api.elevenlabs.io` (plus the app's own origin); the key appears only in the `xi-api-key` request header.
- [ ] Console shows no key, anywhere, including on errors.
- [ ] DevTools Application: the key exists only in IndexedDB `clipforge-ai-secrets`; not in localStorage, sessionStorage, cookies, or the project database.
- [ ] Export the project to MP4 and search the file (`strings file.mp4 | grep -c <first 6 key chars>`): not found; the generated voice is audible in the export.
- [ ] Save/inspect the project JSON (IndexedDB project record): no key and no consent or voice secrets.
- [ ] Privacy text in Settings and README matches what you observed.
