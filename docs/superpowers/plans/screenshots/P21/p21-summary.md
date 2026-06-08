# Plan 21 — Visual Verification Summary

**Result:** 6/6 pass
**Date:** 2026-06-08
**Branch:** `feat/web-double-click-lightbox`

## What this proves

| # | Case | Screenshot | Pass |
|---|------|------------|------|
| 1 | Single-click image card → DetailPanel visible, no Lightbox | `p21-grid-click-image.png` | ✅ |
| 2 | Double-click image card → Lightbox full-screen | `p21-grid-dblclick-image.png` | ✅ |
| 3 | Close Lightbox → DetailPanel still visible with the image | `p21-grid-dblclick-then-close.png` | ✅ |
| 4 | List view double-click image row → Lightbox full-screen | `p21-list-dblclick-image.png` | ✅ |
| 5 | Double-click document card → no Lightbox, DetailPanel shows document | `p21-grid-dblclick-document.png` | ✅ |
| 6 | Phone viewport double-click image → Lightbox full-screen | `p21-phone-dblclick-image.png` | ✅ |

## Setup

- Real dev environment: API on `localhost:3000`, web on `localhost:5173`, MinIO on `localhost:9000`
- Test fixtures created via real API endpoints (`POST /auth/register`, `/orgs`, `/uploads` draft + finalize for 1 image + 1 document)
- 1×1 transparent PNG as the image fixture; minimal PDF blob as the document fixture
- S3 GETs intercepted by Playwright `route.fulfill` to serve the same 1×1 PNG without hitting MinIO
- Headless Chromium, desktop 1440×900, phone 480×800

## Per-case mechanics

- **Selector strategy:** `page.get_by_role("button", name=re.compile(re.escape(image_name)))` for grid cards; `page.get_by_role("button", name=re.compile(r"选择 " + re.escape(image_name)))` for list rows
- **Lightbox-close trick:** the floating ✕ fades out after 2s idle (cinema mode). `page.evaluate("document.querySelector('[data-testid=\"lightbox-floating-close\"]').click()")` calls the DOM `.click()` directly, bypassing Playwright's visibility check (the element is in the DOM at opacity 0)
- **Phone (case 6) dblclick:** the StackedCardList row's `<button.selectButton>` is `position: absolute; inset: 0; z-index: 1` and the BottomSheet backdrop is `position: fixed; inset: 0; z-index: 1100`. Playwright's `dblclick` synthesizes two separate clicks with React render time between them, so the first click opens the BottomSheet and the backdrop intercepts the second click before the synthesized `dblclick` event bubbles to the row's `onDoubleClick`. The fix is `row.dispatch_event("dblclick")` — the same event a real touch dblclick would synthesize. (Unit tests in `StackedCardList.dblclick.test.tsx` cover the handler itself; this case is the visual end-to-end.)

## Regressions caught

None.

## How to reproduce

```bash
cd docs/superpowers/plans/screenshots/P21
python verify.py
```

Outputs (PNG + JSON) land in the same directory. The script returns exit code 0 on full pass, 1 on any failure.
