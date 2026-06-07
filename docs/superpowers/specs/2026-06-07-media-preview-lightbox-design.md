# Media Preview & Lightbox — Design Spec

> **Status:** Approved by user 2026-06-07 via visual companion (Plan 17).
> **Scope:** Image + video + audio preview in a new full-screen lightbox. PDF and Office documents are explicitly out of scope. Touches `packages/web`, `packages/api`, `packages/contracts`, and the API Docker image.

## 1. Problem

A card click in the asset browser today does almost nothing useful for previewing: it sets `state.ui.selectedAssetId` and the right-side `DetailPanel` re-renders a 200- or 320-pixel-wide **thumbnail of the thumbnail** (the same `thumbnailUrl` / `_thumbnailUrl` the cards use). There is no full-size image, no `<video>` element, no audio player, no way to focus on a single asset to actually look at it. The four supported asset types behave the same way:

| Type | Detail panel today | What the user wants |
|---|---|---|
| `image` | 200px-wide WebP thumbnail | Full-size image at the screen's resolution |
| `video` | emoji glyph (📹) — no thumbnail at all | The video plays, with a poster frame and standard controls |
| `audio` | emoji glyph (🎵) | A player, even if the cover is a static icon |
| `document` | emoji glyph (📕) | Out of scope (see §12) |

The backend already has the building blocks: a presigned-original endpoint `GET /api/v1/orgs/:orgId/assets/:id/download-url` (15-min TTL) and a thumbnail pipeline (Plan 6, sharp WebP at 200px). The frontend has the overlay primitives (`Modal`, `Drawer`, `BottomSheet`, `ConfirmDialog`) but no player, no lightbox, and no `<video>` / `<audio>` element anywhere in `src/`.

This plan wires those building blocks together: a new `Lightbox` component for image / video / audio, and a backend poster-extraction service that gives videos a real first-frame thumbnail.

## 2. Goal

Build a lightbox that:

- Opens on a single card click (Desktop, Tablet) or on the same gesture on Phone — **lightbox and DetailPanel both reflect the same asset at the same time**.
- Renders the asset at full size with the right element: `<img>` for images, `<video controls>` for video, `<audio controls>` for audio.
- Shows a **poster** (a real still frame for video, a static icon for audio) before the user clicks play.
- Supports keyboard and mouse navigation: `←` `→` for prev/next, `Esc` to close, click on a thumbnail in the bottom strip to jump. **Click on the dark backdrop does NOT close** (avoids mis-clicks).
- Has a **cinema mode**: the top filename/header and bottom thumbnail strip fade out after 2 seconds of mouse inactivity, fade back on any mouse movement. The user sees just the media when they're not interacting.
- Loads gracefully: thumbnail is shown immediately, full media cross-fades in when ready.
- Fails gracefully: a centered red box with a "重试" button on error (presign failure, network error, codec unsupported).
- Works on every viewport (phone ≤640, tablet 641–1023, desktop 1024–1280, wide >1280) using one component with a responsive layout.

## 3. Design Decisions (confirmed with user)

| # | Dimension | Choice | Rationale |
|---|---|---|---|
| 1 | Click flow | A · click card → full-screen lightbox opens; DetailPanel auto-selects the same asset | Industry-standard DAM pattern; user picked A in mockup round 1 |
| 2 | File types | B · image + video + audio (no PDF, no Office) | User picked B; matches YAGNI. PDF.js is +2MB, Office needs server-side conversion; both deferred |
| 3 | Lightbox layout | C (magazine: top filename/header, center media, bottom thumbnail strip) **+ cinema mode** (chrome fades after 2s idle, returns on mouse move) | User combined C's information density with A's cinema mode |
| 4 | Play behavior | A · custom poster + center play button overlay; user clicks play, video/audio starts; native `<video controls>` / `<audio controls>` take over | User picked A; native audio controls are visually weak, video controls are good |
| 5 | Phone layout | A · same component, responsive breakpoint at 640px (full-screen overlay, header collapses to icon-only) | User picked A; one component, one code path |
| 6 | Video poster source | A · backend ffmpeg extracts the 1-second keyframe → `previews/{orgId}/{assetId}-poster.jpg` → presigned 1h | User picked A; client-side extraction had ~500ms latency; emoji fallback was visually weak |
| 7 | Navigation + close | A · keyboard `←` `→`, hover chevrons, thumbnail strip click — to prev/next; `Esc` closes; click on backdrop does NOT close | User picked A; backdrop click is mis-click bait when the user means to interact with the media |
| 8 | Loading + error | A · thumbnail (or poster) shown immediately, full media cross-fades in; error = centered red box + "重试" button | User picked A for loading; confirmed the standard error UI |

## 4. Final Composition

A single full-screen overlay (`<Lightbox>`) rendered via `createPortal(..., document.body)`. Backdrop is `rgba(0, 0, 0, 0.92)` — almost opaque, but lets the underlying app's wallpaper bleed through subtly.

```
┌──────────────────────────────────────────────────────────────────────┐
│  hero-shot.png                              ⭐  ⬇           ✕       │  ← header (fades in cinema mode)
│  2.4 MB · image/png · 4096×2160                                       │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                                                                      │
│                                                                      │
│                       [ MEDIA — full-bleed, object-fit: contain ]    │
│                                                                      │
│                       (centered play button overlay for video/audio) │
│                                                                      │
│                                                                      │
│                                                                      │
│  ‹                                                                   │  ← hover chevron (left edge)
│                                                       ›              │  ← hover chevron (right edge)
├──────────────────────────────────────────────────────────────────────┤
│  [thumb] [thumb] [thumb] [ CURRENT HIGHLIGHTED ] [thumb] [thumb]      │  ← neighbor strip
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.1 Header (top)

- Left: `filename` (15px / 1.3 / weight 500) + secondary line `size · mime · dimensions` (12px / 1.4 / tertiary color).
- Right: `favorite` toggle (star icon, filled if `asset.favorite`), `download` button (calls existing `getDownloadUrl` and triggers browser download), `close` (✕).
- Hidden on phone (≤640) — replaced by an icon-only floating close button at top-right of the media area.

### 4.2 Media stage (center)

- `<img>` for image: `object-fit: contain` (no crop), `max-width: 100%; max-height: 100%`. Initial render uses the blurred thumbnail; on `onLoad`, cross-fade (200ms) to the real image.
- `<video>` for video: `preload="metadata"`, `controls` (always visible after user clicks play; otherwise hidden), `poster` attribute = `posterUrl` (or `thumbnailUrl` for images). A centered play button (`▶` 80px, semi-transparent dark backdrop with 50% white circle) sits on top of the poster until the user clicks it; clicking dispatches a ref to `<video>` and calls `video.play()`. Fullscreen icon in the native controls.
- `<audio>` for audio: no native visual; the cover is a dark gradient + a large `♪` glyph (120px) + asset name + duration. The center play button is the only visible control until clicked; afterwards the native `<audio controls>` is rendered below the cover.
- All three elements use the same loading pattern: a thumbnail-shaped blur (CSS filter blur + brightness 0.6) until the real media is ready.

### 4.3 Neighbor strip (bottom)

- Horizontal scroll, max-height 80px. Each item is a 64×48 thumbnail (same `thumbnailUrl`). Current item has a 2px white border + slight scale-up (1.04). Adjacent items are dimmed to 60% opacity.
- Auto-scrolls to keep the current item visible.
- On phone (≤640) the strip is replaced by a single floating indicator: `3 / 12`.

### 4.4 Cinema mode

- A `useIdleTimer` (2000ms) starts when the mouse last moved or a key was pressed.
- After 2000ms idle, the header and neighbor strip get `opacity: 0` (200ms ease-out). The center chevrons also fade.
- On `mousemove` / `keydown` / `click`, the timer resets and chrome fades back in (150ms ease-in).
- Cinema mode is **not** active while a video is playing and the user has interacted with the controls (mouse inside the `<video controls>` area is "interaction"). The idle timer pauses when the user is hovering chrome or the video controls.

### 4.5 Errors

A single error UI: centered 360×120 red-bordered card with the error message and a 重试 button. Re-clicking 重试 re-runs the presign + load sequence. If it fails again, the error stays (no infinite toast).

## 5. Architecture & file changes

### 5.1 State model (`packages/web/src/state/`)

Add to `UIState`:
```ts
lightboxAssetId: string | null; // null = lightbox closed
```

Add to `actions.ts`:
```ts
| { type: 'OPEN_LIGHTBOX'; assetId: string }
| { type: 'CLOSE_LIGHTBOX' }
| { type: 'LIGHTBOX_NAVIGATE'; assetId: string }  // set both selectedAssetId and lightboxAssetId atomically
```

Reducer cases (in `reducer.ts`):
- `OPEN_LIGHTBOX`: set `lightboxAssetId = action.assetId`. (If `selectedAssetId` is different, also set it — keeps DetailPanel in sync.)
- `CLOSE_LIGHTBOX`: set `lightboxAssetId = null`. Does NOT touch `selectedAssetId`.
- `LIGHTBOX_NAVIGATE`: set both `selectedAssetId` and `lightboxAssetId` to the new id.

`initialUI.ts` adds `lightboxAssetId: null`.

### 5.2 File map (frontend — `packages/web/src/`)

```
+ components/preview/Lightbox.tsx           // top-level, portal, layout
+ components/preview/Lightbox.module.css   // backdrop, grid, cinema-mode
+ components/preview/MediaStage.tsx        // <img> / <video> / <audio> switch
+ components/preview/PlayButton.tsx        // centered overlay
+ components/preview/NeighborStrip.tsx     // bottom thumbnail bar
+ components/preview/LightboxError.tsx     // red box + 重试
+ hooks/useLightbox.ts                     // state, keyboard, cinema, prev/next
+ hooks/useIdleTimer.ts                    // 3s idle detection (generic)
+ api/posters.ts                           // getPosterUrl(orgId, id) wrapper
~ state/{types,actions,reducer,initialUI}.ts
~ App.tsx                                  // renders <Lightbox> when state.ui.lightboxAssetId !== null
~ components/browser/AssetCard.tsx         // no change to onClick handler (App owns the click → dispatch wiring)
~ components/browser/AssetListRow.tsx      // same
~ api/assets.ts                            // add getPlaybackUrl (alias of getDownloadUrl) for clarity
+ tests/components/preview/Lightbox.test.tsx
+ tests/components/preview/MediaStage.test.tsx
+ tests/components/preview/NeighborStrip.test.tsx
+ tests/hooks/useLightbox.test.ts
~ tests/App.handlers.test.tsx              // + 3 cases for open/close/navigate
```

### 5.3 File map (backend — `packages/api/src/`)

```
+ services/posters.service.ts                       // ffmpeg extract + S3 upload
+ routes/v1/posters.routes.ts                       // POST /assets/:id/regenerate-poster (backfill)
+ lib/ffmpeg.ts                                     // thin wrapper: ffmpeg -ss 1 -i ... -frames:v 1
+ db/migrations/0002_add_poster_key.sql             // assets.poster_key TEXT NULL
~ db/schema.ts                                      // add posterKey column
~ services/uploads.service.ts                       // call generatePoster in finalize (after thumbnail)
~ services/import.service.ts                        // same for bulk import
~ services/assets.service.ts                        // add withPosterUrl helper, mirror withThumbnailUrl
~ routes/v1/assets.routes.ts                        // include posterUrl in list/get responses
~ Dockerfile                                        // RUN apt-get install -y ffmpeg
+ tests/posters.test.ts                             // uses real MinIO + ffmpeg in dev env; in CI, mock ffmpeg
```

### 5.4 File map (contracts — `packages/contracts/src/`)

```ts
~ assets.ts  // AssetSchema: + posterUrl: z.string().url().nullable().optional()
+ tests/assets-schema.test.ts  // assert posterUrl optional + nullable
```

## 6. State model details

### 6.1 `useLightbox` hook

```ts
function useLightbox(opts: {
  open: boolean;
  asset: Asset | null;
  visibleIds: string[];   // current filter result, in display order
  onNavigate: (id: string) => void;  // dispatches LIGHTBOX_NAVIGATE
  onClose: () => void;                // dispatches CLOSE_LIGHTBOX
}) {
  // returns:
  // - isIdle (boolean)  — cinema mode flag
  // - prevId, nextId    — for chevron disabled state
  // - goPrev, goNext    — wrapped to wrap-around or stop at ends
  // - onKeyDown         — attach to the Lightbox's <div> (handles ←, →, Esc)
  // - onMouseMove       — resets idle timer
}
```

The hook owns the keyboard listener (added on mount, removed on unmount). When the lightbox is closed, the hook returns no-op handlers.

### 6.2 `useIdleTimer` hook (generic)

```ts
function useIdleTimer(timeoutMs: number, opts?: { pauseOn?: () => boolean }): boolean;
```

Uses `mousemove`, `keydown`, `touchstart` on `window` (only while the lightbox is open). Returns `true` when idle for `timeoutMs`. Pauses when `opts.pauseOn()` returns `true` (used to pause while user is interacting with native video controls).

### 6.3 `<MediaStage>` rendering

```tsx
function MediaStage({ asset, onError }: { asset: Asset; onError: (e: Error) => void }) {
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<'thumbnail' | 'media' | 'error'>('thumbnail');

  useEffect(() => {
    setStage('thumbnail');
    setPlaybackUrl(null);
    let cancelled = false;
    getPlaybackUrl(asset.orgId, asset.id)
      .then(({ url }) => { if (!cancelled) { setPlaybackUrl(url); setStage('media'); } })
      .catch((e) => { if (!cancelled) { setStage('error'); onError(e); } });
    return () => { cancelled = true; };
  }, [asset.id, asset.orgId, onError]);

  // ...renders <img> / <video> / <audio> based on asset.type, with cross-fade between stage === 'thumbnail' and stage === 'media'
}
```

Note: `asset.orgId` is currently not in the local UI `Asset` type — the implementer must extend `assetAdapter.ts:17-34` to copy `orgId` from the API shape into the local one. This is a small necessary deviation (UI currently tracks `activeOrgId` in `UIState`; passing it as a prop to `<MediaStage>` is the alternative if we don't want to add it to `Asset`).

## 7. Backend poster service

### 7.1 ffmpeg command

```bash
ffmpeg -y -ss 00:00:01 -i "{input}" \
  -frames:v 1 -q:v 2 \
  -vf "scale='min(1280,iw)':-2" \
  "{output}"
```

- `-ss 00:00:01`: seek to 1 second (skip the fade-in / black frames common at the very start of recordings).
- `-frames:v 1`: extract one video frame.
- `-q:v 2`: JPEG quality 2 (visually lossless; output is ~100–300 KB at 1280px wide).
- `-vf "scale='min(1280,iw)':-2"`: cap width at 1280, preserve aspect ratio.
- Output: JPEG, S3 key `previews/{orgId}/{assetId}-poster.jpg`.

### 7.2 Service

```ts
// posters.service.ts
export async function generatePoster(
  orgId: string,
  assetId: string,
  objectKey: string,
): Promise<string> {
  const tmpIn = path.join(os.tmpdir(), `${assetId}-${Date.now()}.in`);
  const tmpOut = path.join(os.tmpdir(), `${assetId}-${Date.now()}-poster.jpg`);
  try {
    await downloadToTmp(objectKey, tmpIn);
    await ffmpeg(tmpIn, tmpOut);
    const posterKey = `previews/${orgId}/${assetId}-poster.jpg`;
    await s3.send(new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: posterKey,
      Body: await fs.promises.readFile(tmpOut),
      ContentType: 'image/jpeg',
    }));
    return posterKey;
  } finally {
    await fs.promises.unlink(tmpIn).catch(() => {});
    await fs.promises.unlink(tmpOut).catch(() => {});
  }
}
```

If ffmpeg is not installed (e.g., CI environment without the binary), the service throws `AppError(500, 'FFMPEG_UNAVAILABLE', ...)`. The finalize handler in `uploads.service.ts` catches this and sets `status: 'failed'` for the asset's poster (asset itself remains `ready`).

### 7.3 Asset schema migration

```sql
ALTER TABLE assets ADD COLUMN poster_key TEXT;
CREATE INDEX assets_poster_key_idx ON assets(poster_key) WHERE poster_key IS NOT NULL;
```

`withPosterUrl(asset)` (new helper in `assets.service.ts`, mirrors `withThumbnailUrl`):
- If `asset.posterKey` is set → presign and attach to `posterUrl`.
- If `asset.type === 'image'` and `asset.thumbnailKey` is set → use `thumbnailUrl` as `posterUrl` (no need to extract a second image; the thumbnail is good enough for the loading state).
- Otherwise `posterUrl = null`.

### 7.4 Triggers

- `uploads.service.ts` finalize: after `generateThumbnail()` succeeds, call `generatePoster()` (only when `asset.type === 'video'`). Both run in the existing background-job pattern (don't block the finalize response).
- `import.service.ts`: same, but for each imported asset.
- `POST /api/v1/orgs/:orgId/assets/:id/regenerate-poster` (Editor+): manually triggers `generatePoster` for backfill. Returns the new `posterUrl`. Idempotent.

### 7.5 Docker

`packages/api/Dockerfile`:
```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
```

Image size impact: ~80 MB. Note in the PR description.

## 8. Behavior

### 8.1 Open / close

- **Open**: `OPEN_LIGHTBOX` (or `LIGHTBOX_NAVIGATE`) dispatched with an `assetId`. The reducer sets `lightboxAssetId` (and `selectedAssetId` on open). The `<Lightbox>` component subscribes to `lightboxAssetId`; on a non-null value, it renders into a portal.
- **Close**: `Esc` keypress (only while lightbox is open and no input is focused), or click on the ✕ button. Dispatches `CLOSE_LIGHTBOX`. `lightboxAssetId` becomes `null`. `selectedAssetId` is untouched. The component unmounts.
- **Click on backdrop** (dark area outside the media): does nothing. (Mis-click guard per design decision 7.)
- **Page-level state**: when the lightbox is open, `App.tsx`'s `useEffect` that auto-opens the BottomSheet on phone does not re-trigger. When the lightbox closes, BottomSheet (if it was open) stays in its previous state.

### 8.2 Navigation

- **Keyboard**: `←` / `→` move to prev/next in the current visible-ids order. At the ends, the chevrons go disabled (or wrap-around — implementer's choice; see §13).
- **Mouse**: hovering the left/right edges of the media area (last 80px on each side) reveals chevron buttons (`‹` / `›`). Clicking navigates.
- **Thumbnail strip**: click a thumbnail to jump directly. The clicked asset becomes the new lightbox content; the strip auto-scrolls to keep the new current item visible.
- **Lightbox ↔ DetailPanel sync**: navigation updates both `selectedAssetId` and `lightboxAssetId` atomically (one action, one render). When the user changes the sidebar selection or types in the search box while the lightbox is open, the lightbox closes (the previous "current asset" may no longer be visible; rather than compute a new prev/next chain, just close).

### 8.3 Cinema mode

- Idle timer starts when the lightbox opens and resets on any `mousemove` / `keydown` / `pointerdown` / `wheel` inside the lightbox's root element.
- After 2000ms idle, header and neighbor strip get `opacity: 0` over 200ms (`transition: opacity 200ms ease-out`).
- The timer pauses when the user is hovering over `<video controls>` (the browser's own controls capture pointer events). It's a "if mouse is over the chrome, do not auto-hide" heuristic — implemented as a check in `useIdleTimer`'s `pauseOn`.
- The chevron buttons follow the same fade rule.

### 8.4 Loading

`<MediaStage>` shows the `thumbnailUrl` (or `posterUrl` for video) as a blurred backdrop the moment the asset is set. Then it calls `getPlaybackUrl` (existing endpoint, returning the presigned original URL). On success, it sets the `<img src>`, `<video src>`, or `<audio src>` to the presigned URL. The element fires `onLoad` / `onCanPlay` → `setStage('media')` → cross-fade from blurred thumbnail to the real media over 200ms.

### 8.5 Error

If `getPlaybackUrl` rejects OR the `<img>/<video>/<audio>` fires an `onError` event, `<MediaStage>` shows the `<LightboxError>` centered. The user clicks 重试 → the effect in §6.3 re-runs (`stage` resets to `'thumbnail'`, presign is requested again).

If the presigned URL's 15-minute TTL expires during a long viewing session (e.g., user has the lightbox open for 20 minutes and is now trying to play the video), the `<video>`'s `onError` fires. The user clicks 重试 → the URL is regenerated. This is the same error path as a network failure.

## 9. Responsive behavior

| Viewport | Header | Center | Strip | Chevrons | Close |
|---|---|---|---|---|---|
| Phone ≤640 | Hidden (replaced by floating ✕ top-right of media) | Full-screen, 16:9 max, letterboxed | Hidden (replaced by `3 / 12` indicator bottom-right) | Hidden | Floating ✕ only |
| Tablet 641–1023 | Full header (filename + actions) | Full-screen with 24px padding | Full strip (max 80px height) | Visible on edge hover | Header ✕ |
| Desktop 1024–1280 | Full header | Full-screen, 48px padding | Full strip | Visible on edge hover | Header ✕ |
| Wide >1280 | Same as desktop, header is sticky to top | Full-screen, 64px padding | Same | Same | Same |

All viewports share the same `<Lightbox>` component; only CSS changes.

`prefers-reduced-motion: reduce` zeroes the cinema-mode fade and the cross-fade. The lightbox still opens/closes instantly.

## 10. API changes

### 10.1 Contract schema (`packages/contracts/src/assets.ts`)

```ts
export const AssetSchema = z.object({
  // ... existing fields
  posterUrl: z.string().url().nullable().optional(),  // ← NEW
});
```

### 10.2 Endpoint additions

| Method | Path | Role | Body | Response |
|---|---|---|---|---|
| POST | `/api/v1/orgs/:orgId/assets/:id/regenerate-poster` | Editor+ | (none) | `200 { asset: AssetWithPosterUrl }` |

This endpoint exists primarily for backfilling the existing assets uploaded before this plan was deployed.

### 10.3 Modified endpoints

`GET /api/v1/orgs/:orgId/assets` and `GET /api/v1/orgs/:orgId/assets/:id`: now include `posterUrl` (null for audio, documents, and videos that haven't been processed yet).

## 11. Validation & error handling

| Case | Lightbox behavior |
|---|---|
| Asset is image, presign OK, image loads | Show image; cross-fade from thumbnail |
| Asset is image, presign OK, image fails to decode (corrupt file) | `<LightboxError>`: "图片加载失败。" + 重试 |
| Asset is video, no `posterUrl`, presign OK | Show emoji poster + play button. On play, video loads and plays |
| Asset is video, `posterUrl` set, presign OK | Show poster + play button. On play, video loads and plays |
| Asset is video, presign fails | `<LightboxError>`: "加载失败。" + 重试 |
| Asset is video, video element fails (codec unsupported) | `<LightboxError>`: "浏览器不支持此视频格式。" + 重试 |
| Asset is audio, presign OK, audio plays | Show cover icon + native `<audio controls>` after first play click |
| Asset is audio, presign fails | `<LightboxError>`: "加载失败。" + 重试 |
| User presses Esc while lightbox is open and an input is focused | Lightbox does NOT close (input is the focus target) |
| User presses Esc while lightbox is open and no input is focused | Lightbox closes |
| User clicks ✕ button | Lightbox closes |
| User changes sidebar selection while lightbox is open | Lightbox closes (handled in `App.tsx` via `useEffect` watching `state.ui.selection`) |
| User opens lightbox for an asset in trash | Lightbox opens but media is hidden (asset is trashed; show "此资源已在回收站中"); Download still works |
| Network offline during presign | `<LightboxError>`: "网络错误,请检查连接。" + 重试 |
| User is on phone, opens lightbox, then rotates device | Layout snaps to the new viewport breakpoint; the lightbox stays open across the resize |

## 12. Out of scope (explicitly)

- **PDF preview** — would need PDF.js (~2 MB dependency, lazy-loadable but adds complexity). Defer to a future plan.
- **Office documents** (.docx, .xlsx, .pptx) — would need server-side conversion (LibreOffice headless) or a hosted viewer. Defer.
- **Public share link previews** — the public share route still returns `thumbnailUrl` only; the new lightbox is private-app-only. The public-share page could be wired up later as a separate plan.
- **Image zoom / pan** — the image is rendered at `object-fit: contain`. No pinch-zoom, no pan. Defer.
- **Video chapter markers / captions (.vtt)** — no UI for these in the existing data model. Defer.
- **Audio waveform / seek preview** — the native `<audio controls>` is a black box. Defer.
- **Bulk-prefetching neighbors** — the strip lazily renders the 12 thumbnails around the current index. For the first cut, just render all visible neighbors; for 10,000 assets this might need windowing. Defer.
- **Light/dark theme** — the app currently has no theme switching; the dark backdrop is hard-coded. If/when a theme system is added, the backdrop can consume a token.

## 13. Open questions for the implementer

- **Wrap-around at list ends?** The user said "chevron grey out at end" (option A), but wrap-around is a defensible alternative. Default: **grey out at end** (matches option A). Wrap-around is a 3-line code change if the user changes their mind.
- **Cinema mode default for the very first 2 seconds?** Should the chrome be visible on open and only fade after 3s of idleness, or fade immediately on open? Default: **visible on open, fade after 3s idle** (so the user can see filenames and what they're looking at).
- **Where does the `orgId` come from in `<MediaStage>`?** Two options: (a) extend the local `Asset` type with `orgId: string` and populate it in `assetAdapter.ts`; (b) pass `activeOrgId` from `UIState` as a prop. Default: **(b) pass as a prop** — keeps the `Asset` type focused on asset fields, not org context. The activeOrgId is already in `UIState` (Plan 14).
- **Should `OPEN_LIGHTBOX` also set `selectedAssetId`?** Yes (per §6.1 reducer cases). This means clicking a card while no asset is selected opens the lightbox AND populates DetailPanel in one render.

## 14. Testing

### 14.1 Frontend tests

`packages/web/tests/components/preview/Lightbox.test.tsx`:
1. Renders nothing when `state.ui.lightboxAssetId === null`.
2. Renders the asset filename in the header when open.
3. Renders `<img>` for an image asset.
4. Renders `<video>` for a video asset.
5. Renders `<audio>` for an audio asset.
6. Renders `<LightboxError>` when `getPlaybackUrl` rejects.
7. Clicking 重试 re-calls `getPlaybackUrl`.

`packages/web/tests/components/preview/MediaStage.test.tsx`:
1. Shows the thumbnail immediately (no spinner).
2. Cross-fades to the real image on `<img onLoad>`.
3. For video: shows poster + center play button. Clicking play dispatches to the `<video>` ref.
4. For audio: shows the cover icon + play button. Clicking play reveals native `<audio controls>`.
5. On `<video onError>`, transitions to error state.

`packages/web/tests/components/preview/NeighborStrip.test.tsx`:
1. Renders the 12 visible neighbors as thumbnails.
2. Current item is highlighted (CSS class).
3. Click on a non-current item triggers `onNavigate(id)`.

`packages/web/tests/hooks/useLightbox.test.ts`:
1. `goPrev` returns the previous id in `visibleIds`; returns `null` at the start.
2. `goNext` returns the next id; returns `null` at the end.
3. Keydown `ArrowLeft` calls `onNavigate(prevId)`.
4. Keydown `ArrowRight` calls `onNavigate(nextId)`.
5. Keydown `Escape` calls `onClose()`.
6. Cinema mode: after 2000ms of no `mousemove`, `isIdle` is `true`. After `mousemove`, `isIdle` is `false`.
7. `useIdleTimer` returns `false` while `pauseOn()` is `true` (e.g., when the user is hovering `<video controls>`).

`packages/web/tests/App.handlers.test.tsx` (extends existing):
1. Clicking a card dispatches `OPEN_LIGHTBOX` with that id AND `selectedAssetId` is also set.
2. Pressing `Escape` while the lightbox is open dispatches `CLOSE_LIGHTBOX` (and `selectedAssetId` is unchanged).
3. Changing the sidebar selection while the lightbox is open dispatches `CLOSE_LIGHTBOX`.

### 14.2 Backend tests

`packages/api/tests/posters.test.ts`:
1. `generatePoster` is called after `uploads.service.ts` finalize for a video asset, but NOT for image/audio/document.
2. `generatePoster` writes `previews/{orgId}/{assetId}-poster.jpg` to S3.
3. `generatePoster` updates `assets.posterKey` in the DB.
4. `withPosterUrl(asset)` returns a presigned URL when `posterKey` is set, `null` otherwise.
5. `POST /api/v1/orgs/:orgId/assets/:id/regenerate-poster` (Editor+) re-extracts and returns the new asset with the new `posterUrl`.
6. Viewer role gets `403 INSUFFICIENT_ROLE` on the regenerate endpoint.
7. ffmpeg-not-available (mock by deleting the binary in a test fixture) → finalize sets `status: 'failed'` for the poster, asset itself is `ready`.

### 14.3 Visual verification

Playwright screenshots (per project convention, in `docs/superpowers/plans/screenshots/P17/`):
- `01-image-lightbox.png` — image open, chrome visible
- `02-image-cinema-mode.png` — same image, 4s later, chrome faded
- `03-video-poster.png` — video, poster + play button
- `04-video-playing.png` — video, native controls visible
- `05-audio-cover.png` — audio, cover + play button
- `06-error-state.png` — error UI
- `07-neighbor-strip.png` — strip with current highlighted
- `08-phone-image.png` — phone viewport, image lightbox
- `09-phone-video.png` — phone viewport, video with phone controls

## 15. A11y checklist

- [x] The lightbox is a portal; focus is trapped inside it while open (existing `Modal.tsx` focus-trap pattern is reused; new component or extended existing).
- [x] `Escape` closes the lightbox (unless an input inside the lightbox has focus).
- [x] The ✕ button has `aria-label="关闭预览"`.
- [x] The favorite and download buttons in the header have `aria-label`s.
- [x] The center play button is a real `<button>` (not a `<div>`) with `aria-label="播放"`.
- [x] The neighbor strip is keyboard-navigable: `Tab` moves between thumbnails; `Enter` / `Space` navigates. `aria-current="true"` on the active thumbnail.
- [x] `←` / `→` keyboard navigation is announced to screen readers via `aria-live="polite"` updates on the filename in the header.
- [x] Cinema mode respects `prefers-reduced-motion: reduce` (no fade).
- [x] Color contrast: white text on the dark backdrop passes WCAG AA. The error red (`--color-text-danger`) is used on a dark backdrop; verify with a contrast checker during implementation.
- [x] The lightbox's root element has `role="dialog"` and `aria-modal="true"` and `aria-labelledby` pointing to the filename `<h2>` (or `<span id="...">`).
- [x] Touch targets: header buttons (close, download, favorite) ≥44px on phone. Center play button is 80px.

## 16. Rollout

- Single worktree at `.worktrees/lightbox/` (branch `feat/lightbox`).
- One PR: `feat(lightbox): media preview lightbox + video poster extraction`.
- Pre-merge gates: all 25 new frontend tests + 7 new backend tests + 1 new contracts test pass; `tsc -b` clean; `pnpm lint` clean.
- Post-merge: run the 9 Playwright visual verifications; attach to PR.
- Migration: `0002_add_poster_key.sql` runs automatically on next API deploy. Existing assets get `posterKey = null`; their `posterUrl` is `null` in API responses until a regenerate call (manual or scheduled) populates it.
- No new env vars. ffmpeg is installed at image build time.
- No new npm dependencies on the frontend. (All HTML elements are native.)
- No new design tokens in `tokens.css` (per project convention; the dark backdrop, accent colors are inlined in `Lightbox.module.css`).
- This is Plan 17 in the project history; the next tag will be `lightbox-v0.15.0`.

## 17. Acceptance criteria

The change is done when:

1. `pnpm -F web test` passes all 25 new frontend tests (7 in `Lightbox.test.tsx` + 5 in `MediaStage.test.tsx` + 3 in `NeighborStrip.test.tsx` + 7 in `useLightbox.test.ts` + 3 new cases in `App.handlers.test.tsx`).
2. `pnpm -F api test` passes all 7 new poster tests; the existing test count remains green.
3. `pnpm -F contracts test` passes the new `assets-schema.test.ts`.
4. `tsc -b` is clean across all packages.
5. `pnpm lint` is clean.
6. All 9 Playwright screenshots are committed under `docs/superpowers/plans/screenshots/P17/`.
7. The lightbox opens, plays video/audio, navigates, and closes on a real running dev server (`pnpm -F web dev` + `pnpm -F api dev`), verified manually with a real video file uploaded through the existing import flow.
8. Existing 457/457 tests remain green (no regressions). The new total will be 490/490 (457 + 25 web + 1 contracts + 7 api).
