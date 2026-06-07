"""P14 visual verification of the 6 DetailPanel actions in Plan 14.

For each action: click, screenshot, reload, screenshot, assert persistence.
The point of Plan 14 is that the 6 DetailPanel actions now persist to the
backend. Visual verification proves this: click an action, reload the page,
and the change should still be there.

The 6 actions:
  1. favorite   — toggle the heart; aria-pressed should flip, and stay flipped after reload
  2. rename     — click name, type new name, press Enter; new name visible after reload
  3. tag        — type a tag in the input, press Enter; tag chip visible after reload
  4. download   — click 下载; download-url request fires (asserted via network capture)
  5. copy-link  — click 复制链接; clipboard should contain /api/v1/share/<token>
  6. delete     — click 移到回收站, confirm; asset moves to trash, stays there after reload

The 12 screenshots:
  p14-{action}-before.png  — after clicking, before reload
  p14-{action}-after.png   — after reload, showing the persisted state
"""

from __future__ import annotations

import base64
import json
import sys
import time
from pathlib import Path
from typing import Any

from playwright.sync_api import sync_playwright, Page, BrowserContext, expect

OUT = Path(__file__).resolve().parent
WEB_URL = "http://localhost:5173/"
API_URL = "http://localhost:3000"

# Unique identifiers per run
RUN_ID = int(time.time())
TEST_EMAIL = f"p14-verify-{RUN_ID}@example.com"
TEST_PASSWORD = "TestPass1234"
TEST_NAME = "P14 Verifier"
TEST_ORG = f"P14 Org {RUN_ID}"
TEST_ASSET_NAME = f"p14-asset-{RUN_ID}.png"

# A 1x1 transparent PNG, base64-encoded. Used as the thumbnail for the import.
# Tiny enough to keep the import bundle well under 50MB.
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


def register_and_login_via_ui(page: Page) -> None:
    """Open the web app, switch to register mode, register, and arrive on the
    main UI. Assumes the dev servers are already up."""
    page.goto(WEB_URL, wait_until="domcontentloaded")
    # Wait for the login screen's headline to appear.
    page.locator("h1", has_text="An archive, organized.").wait_for(
        state="visible", timeout=15_000
    )
    # Switch to register mode
    page.locator("button", has_text="Register").click()
    page.wait_for_timeout(400)  # let the 350ms mode-switch animation finish
    # Fill the registration form
    page.locator("#login-name").fill(TEST_NAME)
    page.locator("#login-email").fill(TEST_EMAIL)
    page.locator("#login-password").fill(TEST_PASSWORD)
    # Submit
    page.locator("button[type='submit']").click()
    # After successful register, App shows the empty state ("Loading…" then
    # the toolbar with no assets). We wait for the toolbar's search input to
    # appear as a proxy for "we're past the LoginScreen".
    page.locator("input[type='search']").wait_for(state="visible", timeout=15_000)


def create_org_and_asset_via_api(page: Page) -> dict[str, Any]:
    """From inside the browser context (so the session cookie is sent), call
    the API to: create an org, then presign + PUT + finalize a real asset.

    We use the real upload flow (POST /uploads → PUT to S3 → POST /finalize)
    rather than the import endpoint, because the import endpoint does NOT
    put the original file in S3 — it leaves a placeholder objectKey, which
    means the download test (which fetches a presigned GET) would 404.

    Returns a dict with the orgId, assetId, assetName, and the file bytes
    (so we can PUT them outside the browser — MinIO's CORS rules can be
    flaky in dev, and we avoid the cross-origin PUT entirely).
    """
    png_bytes = base64.b64decode(TINY_PNG_B64)
    # Step 1: from the browser, create the org and the upload draft. Return
    # the presigned URL + assetId.
    result = page.evaluate(
        """async ({ orgName, assetName, mimeType, size }) => {
            // 1. Create the org. Caller becomes owner.
            const orgRes = await fetch('/api/v1/orgs', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ name: orgName }),
            });
            if (!orgRes.ok) {
                throw new Error('createOrg failed: ' + orgRes.status + ' ' + (await orgRes.text()));
            }
            const orgJson = await orgRes.json();
            const orgId = orgJson.data.org.id;

            // 2. Initiate the upload. Returns the presigned PUT URL and
            //    the draft assetId.
            const upRes = await fetch('/api/v1/orgs/' + orgId + '/uploads', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    filename: assetName,
                    mimeType,
                    size,
                    type: 'image',
                    format: 'PNG',
                }),
            });
            if (!upRes.ok) {
                throw new Error('uploads.initiate failed: ' + upRes.status + ' ' + (await upRes.text()));
            }
            const upJson = await upRes.json();
            return {
                orgId,
                assetId: upJson.data.assetId,
                uploadUrl: upJson.data.uploadUrl,
                objectKey: upJson.data.objectKey,
            };
        }""",
        {
            "orgName": TEST_ORG,
            "assetName": TEST_ASSET_NAME,
            "mimeType": "image/png",
            "size": len(png_bytes),
        },
    )
    org_id = result["orgId"]
    asset_id = result["assetId"]
    upload_url = result["uploadUrl"]
    # Step 2: PUT the file bytes to the presigned URL from Python (no CORS).
    import requests
    put_res = requests.put(
        upload_url,
        data=png_bytes,
        headers={"content-type": "image/png"},
    )
    if put_res.status_code not in (200, 204):
        raise RuntimeError(
            f"presigned PUT failed: {put_res.status_code} {put_res.text}"
        )
    # Step 3: from the browser, finalize the upload.
    finalize = page.evaluate(
        """async ({ orgId, assetId }) => {
            const r = await fetch('/api/v1/orgs/' + orgId + '/assets/' + assetId + '/finalize', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({}),
            });
            if (!r.ok) {
                throw new Error('finalize failed: ' + r.status + ' ' + (await r.text()));
            }
            return await r.json();
        }""",
        {"orgId": org_id, "assetId": asset_id},
    )
    return {
        "orgId": org_id,
        "assetId": asset_id,
        "assetName": TEST_ASSET_NAME,
    }


def open_detail_panel(page: Page, asset_name: str) -> None:
    """Reload to hydrate from API, then click the asset card to open the panel."""
    page.goto(WEB_URL, wait_until="domcontentloaded")
    # Wait for the asset card (its aria-label includes the asset name).
    card = page.get_by_role("button", name=asset_name)
    card.wait_for(state="visible", timeout=15_000)
    card.click()
    # Wait for the DetailPanel to show the asset name in its rename target.
    page.locator("button[title='点击重命名']").wait_for(
        state="visible", timeout=5_000
    )


def wait_hydrated(page: Page) -> None:
    """Wait for the post-reload app to be ready. The search input is the
    strongest signal that we're past the LoginScreen and the StoreProvider
    has finished hydrating."""
    page.locator("input[type='search']").wait_for(state="visible", timeout=15_000)


def reload_to_assets_view(page: Page, asset_name: str) -> None:
    """Reload the page and wait for the asset to reappear in the grid."""
    page.goto(WEB_URL, wait_until="domcontentloaded")
    wait_hydrated(page)
    # The asset may not be the first card (sort is by uploadedAt desc, so the
    # newly-imported one should be first), but it should be findable.
    page.get_by_role("button", name=asset_name).wait_for(
        state="visible", timeout=15_000
    )


def assert_persisted(page: Page, action: str, asset_name: str) -> dict[str, Any]:
    """Read state from the DOM and return what the assertion checked. Each
    action has a different signal. After a reload, the panel is closed; we
    re-open the asset and re-check the relevant field."""
    info: dict[str, Any] = {}
    # Always re-open the panel from the grid.
    page.get_by_role("button", name=asset_name).click()
    page.locator("button[title='点击重命名']").wait_for(
        state="visible", timeout=5_000
    )
    if action == "favorite":
        fav_btn = page.get_by_role("button", name="取消收藏")
        info["favorite_button_aria_label"] = fav_btn.first.get_attribute("aria-label")
        info["favorite_pressed"] = fav_btn.first.get_attribute("aria-pressed")
    elif action == "rename":
        # The rename button's text content is the current name.
        name_btn = page.locator("button[title='点击重命名']").first
        info["displayed_name"] = name_btn.text_content() or ""
    elif action == "tag":
        # The TagEditor renders chips as <span class=...> with the tag text.
        # Look for any chip containing the tag we added.
        chip = page.locator("input[placeholder='+ 添加标签']").locator(
            "xpath=preceding-sibling::div//span"
        )
        # Fallback: just look for the tag text on the page inside the detail panel.
        info["tag_chips_text"] = page.locator("[class*='tagList']").first.inner_text()
    elif action == "delete":
        # After soft-delete, the asset moves to the trash selection. The
        # simplest check is: the grid is empty (or shows a different asset),
        # and the trash count in the sidebar is >= 1.
        trash_btn = page.locator("button", has_text="回收站").first
        info["trash_button_text"] = trash_btn.text_content() or ""
    return info


def main() -> int:
    report: dict[str, Any] = {
        "run_id": RUN_ID,
        "email": TEST_EMAIL,
        "screenshots": [],
        "actions": {},
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx: BrowserContext = browser.new_context(
            viewport={"width": 1280, "height": 900},
            permissions=["clipboard-read", "clipboard-write"],
            accept_downloads=True,
        )
        # Intercept the S3 (MinIO) GET requests and return a fake PNG so the
        # browser doesn't navigate to the MinIO XML error page when the
        # download button is clicked. The download-url API call (which the
        # test cares about) is on our API and is NOT intercepted.
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
        page = ctx.new_page()

        # Capture network requests to verify download-url and share-link fires
        api_calls: list[dict[str, Any]] = []

        def on_request(req) -> None:  # type: ignore[no-untyped-def]
            if "/api/v1/" in req.url:
                api_calls.append({"method": req.method, "url": req.url})

        page.on("request", on_request)

        # 1. Register + arrive at the main UI.
        print(f"[1/8] Registering {TEST_EMAIL} via the UI...")
        register_and_login_via_ui(page)

        # 2. Create an org + import an asset via API (using the session cookie
        #    that the browser context just acquired).
        print("[2/8] Creating org + importing asset via the API...")
        result = create_org_and_asset_via_api(page)
        org_id = result["orgId"]
        asset_id = result["assetId"]
        asset_name = result["assetName"]
        report["org_id"] = org_id
        report["asset_id"] = asset_id
        report["asset_name"] = asset_name
        print(f"     org={org_id} asset={asset_id} name={asset_name}")

        # 3. Reload to hydrate the store with the new asset, open the panel.
        print("[3/8] Reloading to hydrate the store, opening DetailPanel...")
        open_detail_panel(page, asset_name)
        page.wait_for_timeout(300)
        page.screenshot(
            path=str(OUT / "p14-detail-panel-initial.png"), full_page=True
        )
        report["screenshots"].append("p14-detail-panel-initial.png")

        # 4. ACTION: favorite
        # The heart button is in the DetailPanel. Its aria-label and
        # aria-pressed both flip on click. We use aria-pressed as the
        # signal because it's a boolean attribute, not a translated string
        # (the label includes a Chinese title attribute suffix that we
        # don't need to match).
        print("[4/8] Action: favorite")
        # The unfavorited button: aria-pressed="false"
        fav_btn = page.locator("button[aria-pressed='false'][aria-label='收藏']").first
        fav_btn.click()
        # Wait for the optimistic update to flip aria-pressed to true.
        page.locator("button[aria-pressed='true'][aria-label='取消收藏']").first.wait_for(
            state="visible", timeout=5_000
        )
        page.wait_for_timeout(500)  # let the PATCH /assets/:id settle
        page.screenshot(path=str(OUT / "p14-favorite-before.png"), full_page=True)
        report["screenshots"].append("p14-favorite-before.png")
        # Reload and check it persisted.
        reload_to_assets_view(page, asset_name)
        page.wait_for_timeout(300)
        page.screenshot(path=str(OUT / "p14-favorite-after.png"), full_page=True)
        report["screenshots"].append("p14-favorite-after.png")
        fav_info = assert_persisted(page, "favorite", asset_name)
        report["actions"]["favorite"] = {
            "passed": fav_info.get("favorite_pressed") == "true",
            **fav_info,
        }
        # Close the panel (Escape) so the next action opens from a clean state.
        page.keyboard.press("Escape")
        page.wait_for_timeout(200)

        # 5. ACTION: rename
        print("[5/8] Action: rename")
        page.get_by_role("button", name=asset_name).click()
        page.locator("button[title='点击重命名']").wait_for(
            state="visible", timeout=5_000
        )
        # Click the name button to enter edit mode.
        name_btn = page.locator("button[title='点击重命名']").first
        name_btn.click()
        # Wait for the rename <input> to appear. The input is autoFocused and
        # the useEffect selects the existing text on the next animation
        # frame. We use fill() (which sets the value directly and dispatches
        # a single input event) to avoid the timing race where keyboard.type
        # appends to the pre-selected text.
        rename_input = page.locator("input[type='text']").first
        rename_input.wait_for(state="visible", timeout=5_000)
        new_name = f"renamed-{RUN_ID}.png"
        rename_input.fill(new_name)
        page.keyboard.press("Enter")
        # Wait for the new name to render in the button.
        page.locator(f"button[title='点击重命名']:has-text('{new_name}')").wait_for(
            state="visible", timeout=5_000
        )
        page.wait_for_timeout(500)
        page.screenshot(path=str(OUT / "p14-rename-before.png"), full_page=True)
        report["screenshots"].append("p14-rename-before.png")
        # Reload and check the rename persisted (and that the asset card in
        # the grid now shows the new name).
        reload_to_assets_view(page, new_name)
        page.wait_for_timeout(300)
        page.screenshot(path=str(OUT / "p14-rename-after.png"), full_page=True)
        report["screenshots"].append("p14-rename-after.png")
        # Use the new name for subsequent asset lookups.
        rename_info = assert_persisted(page, "rename", new_name)
        report["actions"]["rename"] = {
            "passed": (rename_info.get("displayed_name") or "").strip() == new_name,
            **rename_info,
        }
        page.keyboard.press("Escape")
        page.wait_for_timeout(200)
        asset_name = new_name  # subsequent lookups use the renamed name

        # 6. ACTION: tag
        print("[6/8] Action: tag")
        page.get_by_role("button", name=asset_name).click()
        page.locator("button[title='点击重命名']").wait_for(
            state="visible", timeout=5_000
        )
        tag_input = page.locator("input[placeholder='+ 添加标签']")
        tag_input.click()
        tag_text = f"p14-tag-{RUN_ID}"
        tag_input.fill(tag_text)
        tag_input.press("Enter")
        # Wait for the chip to appear (a span inside the tag list).
        page.locator(f"span:has-text('{tag_text}')").first.wait_for(
            state="visible", timeout=5_000
        )
        page.wait_for_timeout(500)
        page.screenshot(path=str(OUT / "p14-tag-before.png"), full_page=True)
        report["screenshots"].append("p14-tag-before.png")
        reload_to_assets_view(page, asset_name)
        page.wait_for_timeout(300)
        page.screenshot(path=str(OUT / "p14-tag-after.png"), full_page=True)
        report["screenshots"].append("p14-tag-after.png")
        tag_info = assert_persisted(page, "tag", asset_name)
        report["actions"]["tag"] = {
            "passed": tag_text in (tag_info.get("tag_chips_text") or ""),
            "tag_text": tag_text,
            **tag_info,
        }
        page.keyboard.press("Escape")
        page.wait_for_timeout(200)

        # 7. ACTION: copy-link
        # We do this BEFORE delete so the asset is still in the "all" view.
        # (After soft-delete the DetailPanel still shows it on the trash
        # selection, but copy-link is the same code path either way.)
        print("[7/8] Action: copy-link")
        page.get_by_role("button", name=asset_name).click()
        page.locator("button[title='点击重命名']").wait_for(
            state="visible", timeout=5_000
        )
        copy_btn = page.get_by_role("button", name="复制链接").first
        copy_btn.click()
        # Wait for the API call to complete.
        page.wait_for_timeout(1500)
        # Read the clipboard.
        clipboard_text = page.evaluate("navigator.clipboard.readText()")
        page.screenshot(path=str(OUT / "p14-copy-link-before.png"), full_page=True)
        report["screenshots"].append("p14-copy-link-before.png")
        # Reload and click again, this time checking the clipboard re-populates.
        reload_to_assets_view(page, asset_name)
        page.wait_for_timeout(300)
        page.get_by_role("button", name=asset_name).click()
        page.locator("button[title='点击重命名']").wait_for(
            state="visible", timeout=5_000
        )
        page.get_by_role("button", name="复制链接").first.click()
        page.wait_for_timeout(1500)
        clipboard_text_after = page.evaluate("navigator.clipboard.readText()")
        page.screenshot(path=str(OUT / "p14-copy-link-after.png"), full_page=True)
        report["screenshots"].append("p14-copy-link-after.png")
        # Both before and after should contain the share path.
        report["actions"]["copy-link"] = {
            "passed": (
                isinstance(clipboard_text, str)
                and "/api/v1/share/" in clipboard_text
                and isinstance(clipboard_text_after, str)
                and "/api/v1/share/" in clipboard_text_after
            ),
            "clipboard_before": clipboard_text,
            "clipboard_after": clipboard_text_after,
        }
        page.keyboard.press("Escape")
        page.wait_for_timeout(200)

        # 7b. ACTION: download
        # We do this just before delete. The download action triggers a
        # GET /api/v1/orgs/:orgId/assets/:id/download-url, then opens a
        # presigned S3 URL via <a download>. The S3 GET is intercepted by
        # the context's route handler so the browser doesn't navigate to
        # MinIO's XML error page; the screenshot stays on the detail panel.
        # The load-bearing assertion is the network call count: 1 click
        # → 1 /download-url API call. We click twice (once before reload,
        # once after) and assert both happened.
        print("[7b/8] Action: download")
        page.get_by_role("button", name=asset_name).click()
        page.locator("button[title='点击重命名']").wait_for(
            state="visible", timeout=5_000
        )
        download_calls_before = sum(
            1
            for c in api_calls
            if c["method"] == "GET" and "/download-url" in c["url"]
        )
        # Screenshot the panel right BEFORE the click (so the S3 GET
        # hasn't disturbed the page yet). This is the "before" state.
        page.screenshot(path=str(OUT / "p14-download-before.png"), full_page=True)
        report["screenshots"].append("p14-download-before.png")
        # Wire up a one-shot response waiter so we know when the API call
        # has fired, then click. The route fulfill() on the S3 URL stops
        # the browser from navigating away.
        with page.expect_response(
            lambda r: "/download-url" in r.url and r.request.method == "GET",
            timeout=5_000,
        ):
            page.get_by_role("button", name="下载").first.click()
        # Wait a tick for the S3 GET to be intercepted (and the route
        # fulfill to keep the page on the detail panel).
        page.wait_for_timeout(500)
        # The detail panel should still be open.
        try:
            page.locator("button[title='点击重命名']").wait_for(
                state="visible", timeout=2_000
            )
        except Exception:
            # If the click did navigate, force the page back to the asset.
            reload_to_assets_view(page, asset_name)
            page.get_by_role("button", name=asset_name).click()
            page.locator("button[title='点击重命名']").wait_for(
                state="visible", timeout=5_000
            )
        # Reload and click again.
        reload_to_assets_view(page, asset_name)
        page.wait_for_timeout(300)
        page.get_by_role("button", name=asset_name).click()
        page.locator("button[title='点击重命名']").wait_for(
            state="visible", timeout=5_000
        )
        with page.expect_response(
            lambda r: "/download-url" in r.url and r.request.method == "GET",
            timeout=5_000,
        ):
            page.get_by_role("button", name="下载").first.click()
        page.wait_for_timeout(500)
        try:
            page.locator("button[title='点击重命名']").wait_for(
                state="visible", timeout=2_000
            )
        except Exception:
            reload_to_assets_view(page, asset_name)
            page.get_by_role("button", name=asset_name).click()
            page.locator("button[title='点击重命名']").wait_for(
                state="visible", timeout=5_000
            )
        page.screenshot(path=str(OUT / "p14-download-after.png"), full_page=True)
        report["screenshots"].append("p14-download-after.png")
        download_calls_after = sum(
            1
            for c in api_calls
            if c["method"] == "GET" and "/download-url" in c["url"]
        )
        report["actions"]["download"] = {
            "passed": download_calls_after >= download_calls_before + 2,
            "download_url_calls_before": download_calls_before,
            "download_url_calls_after": download_calls_after,
            "note": "asserted via network (count of /download-url calls); headless Chromium's <a download> is intercepted by a context route that returns a fake PNG so the page stays on the detail panel",
        }
        page.keyboard.press("Escape")
        page.wait_for_timeout(200)

        # 8. ACTION: soft-delete (移到回收站)
        # The detail panel has its own confirm dialog. We set up the dialog
        # handler BEFORE clicking.
        print("[8/8] Action: delete (soft)")
        page.get_by_role("button", name=asset_name).click()
        page.locator("button[title='点击重命名']").wait_for(
            state="visible", timeout=5_000
        )
        page.once("dialog", lambda d: d.accept())
        # The Delete button uses the "移到回收站" label.
        page.get_by_role("button", name="移到回收站").first.click()
        # A ConfirmDialog (custom, not a native dialog) may also appear.
        # The handler in App.tsx is async; we wait for the asset to vanish
        # from the grid (the side panel's detail vanishes too) OR for the
        # ConfirmDialog's confirm button to appear. The simplest is to wait
        # for the grid to no longer contain the card.
        try:
            # If a custom ConfirmDialog appears, click the confirm button.
            confirm_btn = page.get_by_role("button", name="移到回收站").nth(1)
            if confirm_btn.is_visible(timeout=1000):
                confirm_btn.click()
        except Exception:
            pass
        # Wait for the card to disappear from the grid and the toast to appear.
        page.wait_for_timeout(2000)
        page.screenshot(path=str(OUT / "p14-delete-before.png"), full_page=True)
        report["screenshots"].append("p14-delete-before.png")
        # Reload. The asset should still be in the trash.
        page.goto(WEB_URL, wait_until="domcontentloaded")
        wait_hydrated(page)
        # Switch to the trash selection so the screenshots show the trash UI.
        page.locator("button", has_text="回收站").first.click()
        page.wait_for_timeout(500)
        # The UI's trash view doesn't refetch trashed assets on reload (it
        # hydrates only the active list and computes the trash count from
        # that in-memory list). The persistence assertion therefore needs
        # to go through the API: re-fetch the asset and check deletedAt.
        asset_after_reload = page.evaluate(
            """async ({ orgId, assetId }) => {
                const r = await fetch('/api/v1/orgs/' + orgId + '/assets/' + assetId, {
                    credentials: 'include',
                });
                if (!r.ok) return { ok: false, status: r.status, text: await r.text() };
                const j = await r.json();
                return { ok: true, asset: j.data };
            }""",
            {"orgId": report["org_id"], "assetId": report["asset_id"]},
        )
        server_deleted_at = (asset_after_reload.get("asset") or {}).get("deletedAt")
        page.screenshot(path=str(OUT / "p14-delete-after.png"), full_page=True)
        report["screenshots"].append("p14-delete-after.png")
        report["actions"]["delete"] = {
            # The persistence assertion is the server's deletedAt being non-null.
            "passed": server_deleted_at is not None,
            "server_deleted_at": server_deleted_at,
            "trashed_card_visible_after_reload": False,
            "note": (
                "asserted via API (server's deletedAt is non-null after reload); "
                "the UI's trash view doesn't refetch trashed assets on initial load, "
                "so the trash card is not visible after reload. Persistence is verified server-side."
            ),
        }

        # Summary
        all_passed = all(a.get("passed", False) for a in report["actions"].values())
        report["all_passed"] = all_passed
        report["api_call_count"] = len(api_calls)
        # Print a digest of the API calls so a reviewer can spot-check
        # (download-url, share-links, soft-delete, etc.) without re-running.
        report["api_calls_digest"] = [
            f"{c['method']} {c['url'].replace(API_URL, '')}" for c in api_calls
        ]

        ctx.close()
        browser.close()

    print(json.dumps(report, indent=2, ensure_ascii=False, default=str))
    return 0 if report.get("all_passed") else 1


if __name__ == "__main__":
    sys.exit(main())
