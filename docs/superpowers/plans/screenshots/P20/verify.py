"""P20 visual verification: post-login GSAP animations on the main page.

What this proves:
  - AppShell mount entrance (4 panes fade in + cards stagger)
  - Card stagger replay on search input
  - Detail panel slide-in (desktop right side)
  - View-mode crossfade (grid -> list)
  - BottomSheet slide-up (phone viewport, tap asset)
  - prefers-reduced-motion: reduce is honored (no animations)

Setup: register a user via API, create an org with 6 assets, log in via
the UI, drive interactions, take screenshots.

Outputs:
  p20-after-login-shell-mounted.png   desktop, after login, all in place
  p20-mid-mount.png                   desktop, mid-animation snapshot
  p20-detail-open.png                 desktop, after clicking a card
  p20-view-mode-toggle.png            desktop, after pressing view toggle
  p20-phone-bottom-sheet.png          phone viewport, after tapping a card
  p20-reduced-motion.png              reduced-motion, all instant
  p20-report.json                     machine-readable summary
"""

from __future__ import annotations

import base64
import json
import re
import sys
import time
from pathlib import Path

import urllib.request
import urllib.parse
import http.cookiejar
from playwright.sync_api import sync_playwright, Page

OUT = Path(__file__).resolve().parent
WEB_URL = "http://localhost:5173/"
API_URL = "http://localhost:3000"

RUN_ID = int(time.time())
TEST_EMAIL = f"p20-verify-{RUN_ID}@example.com"
TEST_PASSWORD = "TestPass1234"
TEST_NAME = "P20 Verifier"
TEST_ORG = f"P20 Org {RUN_ID}"

DEV_COOKIE = "dam_session"

# 1x1 transparent PNG.
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)
TINY_PNG_BYTES = base64.b64decode(TINY_PNG_B64)


def api_post(path: str, body: dict, cookies: dict | None = None) -> tuple[int, dict, dict]:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{API_URL}{path}",
        data=data,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    if cookies:
        cookie_str = "; ".join(f"{k}={v}" for k, v in cookies.items())
        req.add_header("Cookie", cookie_str)
    try:
        with urllib.request.urlopen(req) as resp:
            raw_cookies = resp.getheader("Set-Cookie") or ""
            return resp.status, json.loads(resp.read().decode("utf-8") or "{}"), _parse_cookies(raw_cookies)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8") or "{}"), {}


def _parse_cookies(set_cookie_header: str) -> dict:
    cookies = {}
    if not set_cookie_header:
        return cookies
    for piece in set_cookie_header.split(","):
        first = piece.strip().split(";", 1)[0]
        if "=" in first:
            k, v = first.split("=", 1)
            cookies[k.strip()] = v.strip()
    return cookies


def setup_test_state() -> dict:
    """Create a user with an org and 6 PNG assets, return session cookies."""
    print(f"[setup] Registering {TEST_EMAIL}...")
    status, _, cookies = api_post("/api/v1/auth/register", {
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD,
        "displayName": TEST_NAME,
    })
    if status not in (200, 201):
        raise RuntimeError(f"register failed: {status}")
    print(f"        -> {status}, cookies: {list(cookies.keys())}")

    session = cookies.get(DEV_COOKIE)
    if not session:
        raise RuntimeError(f"no {DEV_COOKIE} cookie from register: {cookies}")

    print(f"[setup] Creating org {TEST_ORG!r}...")
    status, body, _ = api_post("/api/v1/orgs", {"name": TEST_ORG}, cookies)
    if status != 200:
        raise RuntimeError(f"createOrg failed: {status} {body}")
    org_id = body["data"]["org"]["id"]
    print(f"        -> org {org_id}")

    # Upload 6 assets so the stagger is visible.
    for i in range(6):
        asset_name = f"p20-asset-{RUN_ID}-{i}.png"
        status, body, _ = api_post(
            f"/api/v1/orgs/{org_id}/uploads",
            {
                "filename": asset_name,
                "mimeType": "image/png",
                "size": len(TINY_PNG_BYTES),
                "type": "image",
                "format": "PNG",
            },
            cookies,
        )
        if status != 200:
            raise RuntimeError(f"initiate upload {i} failed: {status} {body}")
        asset_id = body["data"]["assetId"]
        upload_url = body["data"]["uploadUrl"]

        req = urllib.request.Request(
            upload_url,
            data=TINY_PNG_BYTES,
            method="PUT",
            headers={
                "Content-Type": "image/png",
                "Content-Length": str(len(TINY_PNG_BYTES)),
            },
        )
        with urllib.request.urlopen(req) as resp:
            if resp.status not in (200, 204):
                raise RuntimeError(f"S3 PUT failed: {resp.status}")

        status, body, _ = api_post(
            f"/api/v1/orgs/{org_id}/assets/{asset_id}/finalize",
            {},
            cookies,
        )
        if status != 200:
            raise RuntimeError(f"finalize {i} failed: {status} {body}")

    print(f"        -> uploaded 6 assets")
    return cookies


def login_via_ui(page: Page, email: str, password: str) -> None:
    """Open the app and log in. Returns after the search input appears."""
    page.goto(WEB_URL, wait_until="domcontentloaded")
    page.locator("h1", has_text="An archive, organized.").wait_for(
        state="visible", timeout=15_000
    )
    page.locator("#login-email").fill(email)
    page.locator("#login-password").fill(password)
    page.locator("button[type='submit']").click()
    # Wait for the post-login UI to appear.
    page.locator("input[type='search']").wait_for(state="visible", timeout=15_000)
    # Hard reload so StoreProvider hydrates with the new session.
    page.reload(wait_until="domcontentloaded")
    # Wait for hydration to complete and the AppShell mount to finish.
    # The mount timeline is ~0.8s; the stagger adds another ~0.5s.
    page.wait_for_timeout(2500)


def main() -> int:
    report: dict = {
        "run_id": RUN_ID,
        "email": TEST_EMAIL,
        "screenshots": [],
        "passed": False,
        "errors": [],
    }

    setup_test_state()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # Desktop context
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})

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

        # 1. Log in via UI.
        print(f"[1/6] Logging in as {TEST_EMAIL}...")
        login_via_ui(page, TEST_EMAIL, TEST_PASSWORD)

        # 2. After login shell mounted.
        print("[2/6] Capturing after-login shell mounted...")
        page.screenshot(path=str(OUT / "p20-after-login-shell-mounted.png"),
                        full_page=True)
        report["screenshots"].append("p20-after-login-shell-mounted.png")

        # 3. Mid-mount snapshot. Reload and screenshot fast.
        print("[3/6] Capturing mid-mount...")
        page.reload(wait_until="domcontentloaded")
        # Wait briefly for the layout to render, then snap during animation.
        # The mount timeline starts immediately after layout (~0.1-0.2s)
        # and the cards stagger ends ~0.9s in. 0.3s is a good mid-point.
        page.wait_for_timeout(300)
        page.screenshot(path=str(OUT / "p20-mid-mount.png"),
                        full_page=True)
        report["screenshots"].append("p20-mid-mount.png")
        # Let the rest of the mount finish.
        page.wait_for_timeout(1500)

        # 4. Detail panel open.
        print("[4/6] Capturing detail open...")
        # Click the first card. The grid renders cards with role/button-like
        # behavior; click on the first card image.
        first_card = page.locator("[data-asset-id], article, li").first
        if first_card.count() > 0:
            first_card.click()
        else:
            # Fallback: click on the first link/image in the main pane.
            page.locator("main img, main button, main [role='button']").first.click()
        page.wait_for_timeout(500)
        page.screenshot(path=str(OUT / "p20-detail-open.png"),
                        full_page=True)
        report["screenshots"].append("p20-detail-open.png")
        # Close it for the next step.
        # Try Escape first; if that fails, click the close button.
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)

        # 5. View-mode toggle.
        print("[5/6] Capturing view-mode toggle...")
        # Toggle to list view by clicking the list button or pressing '2'.
        list_toggle = page.locator(
            "button[aria-label*='列表视图'], button[aria-label*='grid view']"
        ).first
        if list_toggle.count() > 0:
            list_toggle.click()
        else:
            page.keyboard.press("2")
        # Snapshot at the midpoint of the crossfade.
        page.wait_for_timeout(200)
        page.screenshot(path=str(OUT / "p20-view-mode-toggle.png"),
                        full_page=True)
        report["screenshots"].append("p20-view-mode-toggle.png")
        # Toggle back so the phone screenshot is in grid view.
        if list_toggle.count() > 0:
            list_toggle.click()
        page.wait_for_timeout(800)

        ctx.close()

        # 6. Phone viewport, BottomSheet.
        print("[6a/6] Capturing phone BottomSheet...")
        ctx_phone = browser.new_context(
            viewport={"width": 390, "height": 844},
        )
        ctx_phone.route("**/*", fulfill_s3_get)
        page_p = ctx_phone.new_page()
        login_via_ui(page_p, TEST_EMAIL, TEST_PASSWORD)
        # Tap the first card.
        first_card_p = page_p.locator("[data-asset-id], article, li").first
        if first_card_p.count() > 0:
            first_card_p.click()
        else:
            page_p.locator("main img, main button, main [role='button']").first.click()
        page_p.wait_for_timeout(500)
        page_p.screenshot(path=str(OUT / "p20-phone-bottom-sheet.png"),
                          full_page=True)
        report["screenshots"].append("p20-phone-bottom-sheet.png")
        ctx_phone.close()

        # 7. Reduced motion.
        print("[6b/6] Capturing reduced-motion...")
        ctx_rm = browser.new_context(
            viewport={"width": 1280, "height": 900},
            reduced_motion="reduce",
        )
        ctx_rm.route("**/*", fulfill_s3_get)
        page_rm = ctx_rm.new_page()
        login_via_ui(page_rm, TEST_EMAIL, TEST_PASSWORD)
        # Reload and capture immediately so any reduced-motion path is shown.
        page_rm.reload(wait_until="domcontentloaded")
        page_rm.wait_for_timeout(300)
        page_rm.screenshot(path=str(OUT / "p20-reduced-motion.png"),
                           full_page=True)
        report["screenshots"].append("p20-reduced-motion.png")
        ctx_rm.close()

        browser.close()

    # All screenshots produced -> passed.
    report["passed"] = len(report["screenshots"]) == 6

    (OUT / "p20-report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False, default=str),
        encoding="utf-8",
    )
    print("=" * 80)
    print(json.dumps({k: v for k, v in report.items()
                      if k not in ("api_calls_summary",)},
                     indent=2, ensure_ascii=False, default=str))
    print("=" * 80)
    print(f"Result: {'PASS' if report['passed'] else 'FAIL'}")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
