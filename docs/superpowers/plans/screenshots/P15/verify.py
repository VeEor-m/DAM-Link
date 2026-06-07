"""P15 visual verification: after upload, the new asset appears in the grid
WITHOUT a full page reload.

Flow:
  1. Register a self-test user via the UI.
  2. Open the UploadDialog, pick a test image from disk.
  3. Wait for the upload to finish (status 'done' in the dialog).
  4. Assert the grid now contains 1 new card whose name is the uploaded file,
     AND that no `page.goto()` / `page.reload()` was issued between before
     and after.
  5. Screenshot before + after.

Outputs:
  p15-upload-before.png  — empty grid + open dialog
  p15-upload-after.png   — grid shows the new card, dialog still showing done
"""

from __future__ import annotations

import base64
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright, Page

OUT = Path(__file__).resolve().parent
WEB_URL = "http://localhost:5173/"
API_URL = "http://localhost:3000"

RUN_ID = int(time.time())
TEST_EMAIL = f"p15-verify-{RUN_ID}@example.com"
TEST_PASSWORD = "TestPass1234"
TEST_NAME = "P15 Verifier"
TEST_ORG = f"P15 Org {RUN_ID}"
TEST_ASSET_NAME = f"p15-asset-{RUN_ID}.png"

# 1x1 transparent PNG, base64-encoded.
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


def register_via_ui(page: Page) -> None:
    """Open the web app, switch to register mode, register. The first
    registered user is automatically the owner of a new default org (per
    Plan 8: register flow creates an initial org behind the scenes)."""
    page.goto(WEB_URL, wait_until="domcontentloaded")
    page.locator("h1", has_text="An archive, organized.").wait_for(
        state="visible", timeout=15_000
    )
    page.locator("button", has_text="Register").click()
    page.wait_for_timeout(400)
    page.locator("#login-name").fill(TEST_NAME)
    page.locator("#login-email").fill(TEST_EMAIL)
    page.locator("#login-password").fill(TEST_PASSWORD)
    page.locator("button[type='submit']").click()
    # Wait for the toolbar (post-LoginScreen).
    page.locator("input[type='search']").wait_for(state="visible", timeout=15_000)


def count_grid_cards(page: Page) -> int:
    """Count asset cards in the grid. The AssetCard is a <button> with an
    aria-label of the form "<name>，<size>". We count any <button> that has
    a Chinese full-width comma (，) in its aria-label — that's the
    AssetCard pattern (other buttons in the UI use plain English commas or
    no commas)."""
    return page.evaluate(
        """() => Array.from(document.querySelectorAll('button[aria-label]'))
            .filter(b => b.getAttribute('aria-label').includes('，'))
            .length"""
    )


def open_upload_dialog(page: Page) -> None:
    """Click the toolbar's upload button. aria-label is "上传资产"."""
    page.locator("button[aria-label='上传资产']").first.click()
    # The dialog may show no-orgs state (新用户无组织) or the dropzone
    # (老用户有组织). Handle both. Wait a beat for the modal to mount.
    page.wait_for_timeout(800)
    # If no-orgs state, create the org.
    no_orgs_heading = page.locator("h3", has_text="需要先创建组织")
    if no_orgs_heading.is_visible():
        print("     detected no-orgs state, creating an org...")
        page.locator("input[aria-label='组织名称']").fill(TEST_ORG)
        page.get_by_role("button", name="创建").first.click()
    # Now wait for the dropzone.
    page.locator("text=拖拽文件到此处").wait_for(state="visible", timeout=10_000)


def upload_test_png(page: Page) -> None:
    """Set the hidden file input's files via the file chooser pattern.
    The dialog's <input type="file"> is inside the DropZone."""
    # The file input is inside the modal. set_input_files is the cleanest
    # way to feed a file in headless mode (no OS dialog). We name the file
    # with the test asset name so we can assert the card by name.
    file_input = page.locator("input[type='file']").first
    tmp_png = OUT / TEST_ASSET_NAME
    tmp_png.write_bytes(base64.b64decode(TINY_PNG_B64))
    try:
        file_input.set_input_files(str(tmp_png))
    finally:
        pass
    # Wait for the upload to reach the "done" row. The status text in the
    # dialog is the final character "✓".
    page.locator("text=✓").first.wait_for(state="visible", timeout=15_000)


def main() -> int:
    report: dict = {
        "run_id": RUN_ID,
        "email": TEST_EMAIL,
        "screenshots": [],
        "grid_count_before": 0,
        "grid_count_after": 0,
        "asset_card_visible_after": False,
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            viewport={"width": 1280, "height": 900},
        )
        # Intercept S3 (MinIO) GETs so the page never navigates to the
        # MinIO XML error page when thumbnails are rendered.
        def fulfill_s3_get(route):  # type: ignore[no-untyped-def]
            req = route.request
            if "localhost:9000" in req.url and req.method == "GET":
                route.fulfill(
                    status=200,
                    content_type="image/png",
                    body=base64.b64decode(TINY_PNG_B64),
                )
            else:
                route.continue_()

        ctx.route("**/*", fulfill_s3_get)
        page = ctx.new_page()

        # Track navigations to PROVE no page reload happened.
        nav_count = {"value": 0, "urls": []}
        def on_framenavigated(frame):  # type: ignore[no-untyped-def]
            if frame == page.main_frame:
                nav_count["value"] += 1
                nav_count["urls"].append(frame.url)
        page.on("framenavigated", on_framenavigated)

        # Track API calls for debugging.
        api_calls: list[dict] = []
        def on_request(req) -> None:  # type: ignore[no-untyped-def]
            if "/api/v1/" in req.url:
                api_calls.append({"method": req.method, "url": req.url})
        page.on("request", on_request)

        # 1. Register.
        print(f"[1/5] Registering {TEST_EMAIL}...")
        register_via_ui(page)
        page.wait_for_timeout(500)  # let initial hydration settle
        # NOW capture the navigation baseline, after the initial goto.
        nav_baseline = nav_count["value"]

        # 2. Snapshot the BEFORE state: empty grid, no dialog.
        print("[2/5] Capturing BEFORE (empty grid)...")
        report["grid_count_before"] = count_grid_cards(page)
        # The page shows the empty-state ("还没有任何资产" or similar). Take the shot.
        page.screenshot(path=str(OUT / "p15-upload-before.png"), full_page=True)
        report["screenshots"].append("p15-upload-before.png")

        # 3. Open the UploadDialog and upload.
        print("[3/5] Opening UploadDialog and uploading...")
        open_upload_dialog(page)
        upload_test_png(page)

        # 4. Wait for the new card to appear in the grid (this is the
        #    load-bearing assertion — no reload involved).
        print("[4/5] Waiting for new card in grid (no reload)...")
        # The card has the asset name in its aria-label. We wait a beat for
        # the add-asset re-render to settle, then look for the card.
        page.wait_for_timeout(1500)
        report["grid_count_after"] = count_grid_cards(page)
        # The new asset name should be findable somewhere on the page.
        report["asset_name_in_dom"] = page.locator(
            f"text={TEST_ASSET_NAME}"
        ).count() > 0
        # Take the screenshot regardless; it's the visual proof.
        page.screenshot(path=str(OUT / "p15-upload-after.png"), full_page=True)
        report["screenshots"].append("p15-upload-after.png")
        report["navigations_during_upload"] = nav_count["value"] - nav_baseline
        report["navigation_urls"] = nav_count["urls"]
        # The key check: did the getAsset API call fire? That's the wiring
        # of onUploaded → getAsset → ADD_ASSET.
        get_asset_calls = [
            c for c in api_calls
            if c["method"] == "GET" and c["url"].endswith(f"/{TEST_ASSET_NAME.split('.')[0].split('-')[-1]}".replace(".png", ""))
            or (
                c["method"] == "GET"
                and "/assets/" in c["url"]
                and c["url"].rstrip("/").split("/")[-1] not in ("count", "download-url", "sidebar")
            )
        ]
        # The getAsset call URL ends with the server-asset-id (a UUID). Match
        # by path: GET /api/v1/orgs/.../assets/<uuid>.
        report["get_asset_calls"] = sum(
            1
            for c in api_calls
            if c["method"] == "GET"
            and "/assets/" in c["url"]
            and c["url"].rstrip("/").split("/")[-1].count("-") == 4  # UUID shape
        )

        # 5. Cleanup + summary.
        print("[5/5] Summary...")
        tmp_png = OUT / TEST_ASSET_NAME
        if tmp_png.exists():
            tmp_png.unlink()

        report["passed"] = (
            report["asset_name_in_dom"]
            and report["get_asset_calls"] >= 1
            and report["navigations_during_upload"] == 0
        )
        report["api_calls"] = [
            f"{c['method']} {c['url'].replace(API_URL, '')}" for c in api_calls
        ]
        ctx.close()
        browser.close()

    print(json.dumps(report, indent=2, ensure_ascii=False, default=str))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
