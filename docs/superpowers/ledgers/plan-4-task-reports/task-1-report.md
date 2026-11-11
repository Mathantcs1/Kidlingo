# Task 1 report: split compositor (behaviour-preserving)

Commit f33ceee `refactor: split compositor into collect/render target modules`.

## What moved
- `src/render/renderTarget.ts` (43 lines, new): `RenderTarget` moved verbatim out of blur.ts and exported.
- `src/render/drawCollect.ts` (92, new): `Draw`, `DrawContext {gl, images, videoSlots, assertUsable, isLive}`, `collectDraws` (all of Phase 1), plus `videoSlot`/`pruneVideoSlots` as module functions and `UPRIGHT`. Order of operations unchanged (all uploads before any draw, per-clip skip on missing frame, prune after loop).
- `src/render/compositor.ts` 200 -> 143: Phase 1 replaced by `await collectDraws(this.drawContext, ...)`; Phase 2 composite unchanged. Public API, `CompositorStats`, `createCompositor` unchanged.
- `src/render/blur.ts` 93 -> 53: imports RenderTarget.
- `src/render/gl.ts` 198: untouched.

## Verification
- Baseline (before changes): 29 passed (compositor, blur, rotation, pip, layers-render, export-gl, images).
- After: `npm test` 831 passed (55 files); typecheck clean; build OK; same 7 specs 29 passed.
- Full `npm run e2e -- --trace off`: 256 passed (8.5m).

## Concerns
None.
