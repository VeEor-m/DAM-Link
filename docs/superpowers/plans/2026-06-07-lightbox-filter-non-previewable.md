# Plan 20 — Lightbox filter non-previewable

**Date:** 2026-06-07
**Status:** ✅ Done
**Tag:** `lightbox-filter-non-previewable-v0.19.0`
**Branch:** `feat/web-lightbox-previewable-filter`

## What

Fixes a bug where opening the lightbox for an image/video, then pressing
arrow keys to navigate, could land on a non-previewable asset (document /
audio). The lightbox's `MediaStage` has no case for those types, so the
center rendered an empty box with a filename header and chevrons — the
exact "blank center" the user reported in
`docs/superpowers/plans/screenshots/Self-Test/test-md.png`.

## Why

Plan 17's `lightbox-fixes-v0.18.0` (commit `87056d9`) protected the
**entry point** — `handleSelectAsset` in `App.tsx` only dispatches
`OPEN_LIGHTBOX` for `image`/`video`; clicking a document/audio card
opens the DetailPanel instead. But the **navigation surface** (chevron
prev/next, NeighborStrip, keyboard arrows) was still driven by
`selectVisibleAssetIds(state)`, which returns **all** visible asset
types. With a mixed-type visible list, the chevron chain walked into
non-previewable assets.

Root cause: `App.tsx`'s `visibleIds` (used for the lightbox's prev/next
chain + `NeighborStrip`) was unfiltered, including document/audio.

## How

Three small, focused changes:

1. **`packages/web/src/state/selectors.ts`** — add
   `PREVIEWABLE_ASSET_TYPES: ReadonlySet<AssetType>` (single source of
   truth: `image` and `video`) and a new selector
   `selectLightboxVisibleAssetIds(state)` that returns visible ids in
   display order, filtered to previewable types.

2. **`packages/web/src/App.tsx`** — switch from
   `selectVisibleAssetIds` to `selectLightboxVisibleAssetIds` for the
   `<Lightbox>` prop, and rename the local `visibleIds` memo to
   `lightboxVisibleIds` so the scope is obvious. The `visibleNeighborItems`
   derivation is updated to consume the same filtered list, so the
   `NeighborStrip` only shows previewable items.

3. **`packages/web/tests/selectors.lightboxVisibleIds.test.ts`** — 6
   new tests:
   - `PREVIEWABLE_ASSET_TYPES` contains exactly image and video
   - returns all ids when all are previewable
   - drops document/audio ids (the user-visible bug)
   - empty list when none are previewable
   - preserves display order
   - excludes trashed assets (delegates to underlying selection)

## Verification

**Unit:** `pnpm -F @dam-link/web test` — **287/287 web tests pass**
(was 281, +6 new).

**Build:** `pnpm -F @dam-link/web build` — clean.

**Typecheck:** `tsc -b` — clean (web + api + contracts).

**Lint:** 9 pre-existing errors (same count as `main` baseline — in
`persistence.ts` and `store.tsx`, not introduced by this plan).

**Visual (Playwright, real Chrome + real API + real MinIO):**
`docs/superpowers/plans/screenshots/P20/verify.py`:
1. Registers a fresh user, creates an org, uploads 1 image + 1
   document (the minimal repro of the user's "image + document in the
   visible list" scenario).
2. Logs in via UI, opens the lightbox for the image.
3. Asserts the lightbox header is the **image** name (not the document).
4. Asserts both chevron buttons are **disabled** (no next/prev
   previewable — the fix).
5. Asserts the NeighborStrip has **exactly 1** item (the image, not
   the document).
6. Presses ArrowRight anyway → asserts the header doesn't change
   (useLightbox short-circuits on no nextId).
7. Screenshot: `p20-lightbox-image.png`.

Report: `p20-report.json` — `passed: true`, all 5 checks pass.

## Diff stats

```
packages/web/src/App.tsx                              | 16 ++++++++++------
packages/web/src/state/selectors.ts                   | 25 +++++++++++++++++++++++++
packages/web/tests/selectors.lightboxVisibleIds.test.ts | 53 ++++++++++++++++++++++++++++++++++
3 files changed, 88 insertions(+), 6 deletions(-)
```

## 4 generalization rules

1. **A "show me only X" filter must apply to every navigation surface,
   not just the entry point.** Protecting the click handler is
   necessary but not sufficient — the chevron chain, the thumbnail
   strip, and any keyboard handler driven by the same list can also
   walk into the filtered-out subset.

2. **`<Component>Internal`'s data shape and the *external* view of
   that data must agree.** `MediaStage` has cases for `image` /
   `video` / `audio`; the lightbox is fed an audio asset only by
   accident (the old visibleIds scope). The new selector narrows
   the scope at the boundary so the contract is honored
   structurally, not just by convention.

3. **Constant sets belong in selectors, not components.** Adding
   `PREVIEWABLE_ASSET_TYPES` next to the selector that consumes it
   keeps the "what can I preview" decision in one file, and makes
   it trivial to add `pdf` or `text` later by editing one
   `Set<AssetType>`.

4. **For "navigate forward by N items" patterns, always test
   boundary positions**, not just the happy middle. The user's bug
   was specifically at the boundary where the *last* previewable
   asset is followed by a non-previewable one — the chevron said
   "you can go right" but the destination was broken. The
   `chevron_right_disabled` assertion in the verify script pins
   that down.
