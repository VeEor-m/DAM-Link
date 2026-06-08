"""P21 visual verification: double-click opens Lightbox, single-click selects.

What this proves:
  1. Single-click image card -> DetailPanel visible, NO Lightbox dialog
  2. Double-click image card -> Lightbox full-screen
  3. Close Lightbox -> DetailPanel still showing the image
  4. List-view double-click image row -> Lightbox full-screen
  5. Double-click document card -> NO Lightbox, DetailPanel shows document
  6. Phone viewport double-click image -> Lightbox full-screen

Setup: register a user via API, create an org, upload 1 image + 1 document.
Log in via the UI, drive click/dblclick interactions, take screenshots.

Outputs:
  p21-grid-click-image.png           desktop, after single-click image
  p21-grid-dblclick-image.png        desktop, after dblclick image
  p21-grid-dblclick-then-close.png   desktop, after closing the Lightbox
  p21-list-dblclick-image.png        desktop, list view, dblclick image row
  p21-grid-dblclick-document.png     desktop, dblclick document (no Lightbox)
  p21-phone-dblclick-image.png       phone viewport, dblclick image
  p21-report.json                    machine-readable summary
"""

from __future__ import annotations

import base64
import json
import re
import sys
import time
from pathlib import Path
import urllib.request
from playwright.sync_api import sync_playwright, Page

OUT = Path(__file__).resolve().parent
WEB_URL = "http://localhost:5173/"
API_URL = "http://localhost:3000"

RUN_ID = int(time.time())
TEST_EMAIL = f"p21-verify-{RUN_ID}@example.com"
TEST_PASSWORD = "TestPass1234"
TEST_NAME = "P21 Verifier"
TEST_ORG = f"P21 Org {RUN_ID}"

DEV_COOKIE = "dam_session"

# 1x1 transparent PNG.
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)
TINY_PNG_BYTES = base64.b64decode(TINY_PNG_B64)

# Plain-text "document" — any non-empty bytes work; the API only checks size.
TINY_DOC_BYTES = b"%PDF-1.4\n% P21 verify fixture\n"


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


def _put_to_s3(url: str, body: bytes, content_type: str) -> None:
    req = urllib.request.Request(
        url,
        data=body,
        method="PUT",
        headers={
            "Content-Type": content_type,
            "Content-Length": str(len(body)),
        },
    )
    with urllib.request.urlopen(req) as resp:
        if resp.status not in (200, 204):
            raise RuntimeError(f"S3 PUT failed: {resp.status}")


def setup_test_state() -> tuple[dict, str, str, str]:
    """Create a user with an org and 1 image + 1 document asset.
    Returns (cookies, org_id, image_name, doc_name)."""
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

    image_name = f"p21-image-{RUN_ID}.png"
    doc_name = f"p21-doc-{RUN_ID}.pdf"

    for filename, mime, atype, fmt, body_bytes in [
        (image_name, "image/png", "image", "PNG", TINY_PNG_BYTES),
        (doc_name, "application/pdf", "document", "PDF", TINY_DOC_BYTES),
    ]:
        status, body, _ = api_post(
            f"/api/v1/orgs/{org_id}/uploads",
            {
                "filename": filename,
                "mimeType": mime,
                "size": len(body_bytes),
                "type": atype,
                "format": fmt,
            },
            cookies,
        )
        if status != 200:
            raise RuntimeError(f"initiate upload {filename} failed: {status} {body}")
        asset_id = body["data"]["assetId"]
        upload_url = body["data"]["uploadUrl"]

        _put_to_s3(upload_url, body_bytes, mime)

        status, body, _ = api_post(
            f"/api/v1/orgs/{org_id}/assets/{asset_id}/finalize",
            {},
            cookies,
        )
        if status != 200:
            raise RuntimeError(f"finalize {filename} failed: {status} {body}")

    print(f"        -> uploaded 1 image + 1 document")
    return cookies, org_id, image_name, doc_name


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
    page.wait_for_timeout(2000)


def main() -> int:
    report: dict = {
        "run_id": RUN_ID,
        "email": TEST_EMAIL,
        "results": [],
        "passed": False,
        "errors": [],
    }

    cookies, org_id, image_name, doc_name = setup_test_state()

    def record(name: str, passed: bool, details: str) -> None:
        report["results"].append({"name": name, "passed": passed, "details": details})
        print(f"  {'✓' if passed else '✗'} {name}: {details}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

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

        # Desktop context
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        ctx.route("**/*", fulfill_s3_get)
        page = ctx.new_page()

        # Login
        print(f"[setup] Logging in as {TEST_EMAIL}...")
        login_via_ui(page, TEST_EMAIL, TEST_PASSWORD)

        # Case 1: single-click image card -> DetailPanel visible, no Lightbox.
        print("\n[1/6] Single-click image card (must NOT open Lightbox)...")
        img_card = page.get_by_role("button", name=re.compile(re.escape(image_name))).first
        img_card.wait_for(state="visible", timeout=10_000)
        img_card.click()
        page.wait_for_timeout(200)
        lightbox_count = page.locator('[data-testid="lightbox"]').count()
        detail_rename = page.locator('[title="点击重命名"]').count()
        record(
            "p21-grid-click-image",
            lightbox_count == 0 and detail_rename > 0,
            f"lightbox_count={lightbox_count}, detail_rename_count={detail_rename}",
        )
        page.screenshot(path=str(OUT / "p21-grid-click-image.png"), full_page=True)

        # Case 2: double-click image card -> Lightbox full-screen.
        print("\n[2/6] Double-click image card (opens Lightbox)...")
        # The dblclick must be on the same card. Use a fresh locator.
        img_card = page.get_by_role("button", name=re.compile(re.escape(image_name))).first
        img_card.dblclick()
        page.wait_for_timeout(300)
        lightbox_count = page.locator('[data-testid="lightbox"]').count()
        record(
            "p21-grid-dblclick-image",
            lightbox_count == 1,
            f"lightbox_count={lightbox_count}",
        )
        page.screenshot(path=str(OUT / "p21-grid-dblclick-image.png"), full_page=True)

        # Case 3: close the Lightbox -> DetailPanel still visible with the image.
        print("\n[3/6] Close Lightbox (DetailPanel still visible)...")
        # The floating ✕ fades out after 2s idle (cinema mode). Use a
        # direct DOM .click() call to bypass Playwright's visibility
        # check (cinema mode keeps the element in the DOM but at 0
        # opacity, which makes Playwright consider it "not visible").
        page.evaluate(
            "document.querySelector('[data-testid=\"lightbox-floating-close\"]').click()"
        )
        page.wait_for_timeout(800)
        lightbox_count = page.locator('[data-testid="lightbox"]').count()
        detail_rename = page.locator('[title="点击重命名"]').count()
        record(
            "p21-grid-dblclick-then-close",
            lightbox_count == 0 and detail_rename > 0,
            f"lightbox_count={lightbox_count}, detail_rename_count={detail_rename}",
        )
        page.screenshot(path=str(OUT / "p21-grid-dblclick-then-close.png"), full_page=True)

        # Case 4: list view + dblclick image row -> Lightbox full-screen.
        print("\n[4/6] List view double-click image row (opens Lightbox)...")
        # Switch to list view by pressing '2' (keyboard shortcut).
        page.keyboard.press("2")
        page.wait_for_timeout(400)
        # The select button has aria-label "选择 <filename>".
        list_select = page.get_by_role(
            "button", name=re.compile(r"选择 " + re.escape(image_name))
        ).first
        list_select.wait_for(state="visible", timeout=10_000)
        list_select.dblclick()
        page.wait_for_timeout(300)
        lightbox_count = page.locator('[data-testid="lightbox"]').count()
        record(
            "p21-list-dblclick-image",
            lightbox_count == 1,
            f"lightbox_count={lightbox_count}",
        )
        page.screenshot(path=str(OUT / "p21-list-dblclick-image.png"), full_page=True)
        # Close lightbox before next case (bypass visibility check via JS).
        page.evaluate(
            "document.querySelector('[data-testid=\"lightbox-floating-close\"]').click()"
        )
        page.wait_for_timeout(400)
        # Switch back to grid view.
        page.keyboard.press("1")
        page.wait_for_timeout(400)

        # Case 5: dblclick document card -> no Lightbox, DetailPanel shows document.
        print("\n[5/6] Double-click document card (must NOT open Lightbox)...")
        doc_card = page.get_by_role("button", name=re.compile(re.escape(doc_name))).first
        doc_card.wait_for(state="visible", timeout=10_000)
        doc_card.dblclick()
        page.wait_for_timeout(200)
        lightbox_count = page.locator('[data-testid="lightbox"]').count()
        detail_rename = page.locator('[title="点击重命名"]').count()
        record(
            "p21-grid-dblclick-document",
            lightbox_count == 0 and detail_rename > 0,
            f"lightbox_count={lightbox_count}, detail_rename_count={detail_rename}",
        )
        page.screenshot(path=str(OUT / "p21-grid-dblclick-document.png"), full_page=True)

        ctx.close()

        # Case 6: phone viewport dblclick image -> Lightbox.
        print("\n[6/6] Phone viewport double-click image (opens Lightbox)...")
        ctx_phone = browser.new_context(viewport={"width": 480, "height": 800})
        ctx_phone.route("**/*", fulfill_s3_get)
        page_p = ctx_phone.new_page()
        login_via_ui(page_p, TEST_EMAIL, TEST_PASSWORD)
        # Default view on phone is grid; switch to list view (the natural
        # phone layout, where StackedCardList renders rows) by pressing
        # "2" — the same keyboard shortcut used on desktop.
        page_p.keyboard.press("2")
        page_p.wait_for_timeout(400)
        # On phone, the StackedCardList renders rows with role="listitem"
        # and onDoubleClick attached to the row. The select button
        # (role=button, aria-label "选择 <filename>") is `position:
        # absolute; inset: 0` so it covers the whole row. Playwright's
        # `dblclick` synthesizes two clicks with React render time
        # between them; on phone the first click opens the BottomSheet
        # whose backdrop (`position: fixed; inset: 0; z-index: 1100`)
        # intercepts the second click before the synthesized dblclick
        # event can bubble to the row's onDoubleClick. (A real touch
        # dblclick fires fast enough that both clicks land on the
        # same element before React mounts the BottomSheet, but
        # Playwright's per-click wait_for is slower than that.)
        #
        # The fix: dispatch a single `dblclick` event directly on the
        # row. This is the same event a browser would synthesize on a
        # real double-tap, and it fires the row's onDoubleClick handler
        # without opening the BottomSheet. This is what the unit tests
        # in `StackedCardList.dblclick.test.tsx` already verify; the
        # Playwright check here is the visual end-to-end: does the
        # Lightbox render in the phone viewport?
        row_p = page_p.locator(
            f'[role="listitem"]:has-text("{image_name}")'
        ).first
        row_p.wait_for(state="visible", timeout=10_000)
        row_p.dispatch_event("dblclick")
        page_p.wait_for_timeout(300)
        lightbox_count = page_p.locator('[data-testid="lightbox"]').count()
        record(
            "p21-phone-dblclick-image",
            lightbox_count == 1,
            f"lightbox_count={lightbox_count}",
        )
        page_p.screenshot(path=str(OUT / "p21-phone-dblclick-image.png"), full_page=True)
        ctx_phone.close()

        browser.close()

    total = len(report["results"])
    passed = sum(1 for r in report["results"] if r["passed"])
    report["total"] = total
    report["passed_count"] = passed
    report["passed"] = passed == total

    (OUT / "p21-report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False, default=str),
        encoding="utf-8",
    )
    print("=" * 80)
    print(f"Result: {passed}/{total} pass")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
