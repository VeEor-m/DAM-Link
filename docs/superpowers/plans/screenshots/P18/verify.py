"""P18 visual verification: after hydration, non-asset state changes
(typing in search, toggling view mode) do NOT trigger additional
GET /sidebar-counts requests.

What this proves:
  - On main with the bug, the feedback loop produced ~2 fetches/sec
    in steady state — every keystroke in the search box would reset
    the 500ms debounce timer and ultimately fire a refetch.
  - With the fix (Plan 18), wrappedDispatch is stable, so the App
    effect's deps don't churn, so typing/clicking causes zero new
    sidebar-counts calls.

Setup:
  Fresh register users have no org, so listMyOrgs returns [] and the
  StoreProvider's loadState stops at the orgs step (no listAssets, no
  sidebar-counts). We need a user with at least one org and one asset
  to exercise the full hydration chain. We use the API to set this
  up, then drive the UI in the browser.

Flow:
  1. API: register a user (auto-creates one initial org per the auth
     flow), create an org, upload a tiny PNG asset.
  2. Browser: open the app, log in via UI, hard-reload to trigger
     StoreProvider hydration.
  3. Wait for hydration (sidebar counts + asset card to appear).
  4. Count baseline sidebar-counts calls.
  5. Type 5 characters into the search box.
  6. Wait 2s (well past the 500ms debounce).
  7. Count sidebar-counts calls. With the fix, the delta should be 0.
  8. Click the "列表视图" view-mode toggle.
  9. Wait 2s. Count again. Delta should still be 0.
 10. Screenshots: after typing + after view toggle.

Outputs:
  p18-after-typing.png        — UI after typing in search
  p18-after-view-toggle.png   — UI after view mode toggle
  p18-network-trace.txt       — full API call trace
  p18-report.json             — machine-readable summary
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
TEST_EMAIL = f"p18-verify-{RUN_ID}@example.com"
TEST_PASSWORD = "TestPass1234"
TEST_NAME = "P18 Verifier"
TEST_ORG = f"P18 Org {RUN_ID}"
TEST_ASSET_NAME = f"p18-asset-{RUN_ID}.png"

# Dev server's session cookie name (the test suite uses `dam_session_test`).
DEV_COOKIE = "dam_session"

# 1x1 transparent PNG.
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)
TINY_PNG_BYTES = base64.b64decode(TINY_PNG_B64)


def api_post(path: str, body: dict, cookies: dict | None = None) -> tuple[int, dict, dict]:
    """POST to the API, return (status, response_json, response_cookies)."""
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


def api_get(path: str, cookies: dict) -> tuple[int, dict]:
    req = urllib.request.Request(f"{API_URL}{path}")
    cookie_str = "; ".join(f"{k}={v}" for k, v in cookies.items())
    req.add_header("Cookie", cookie_str)
    with urllib.request.urlopen(req) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8") or "{}")


def _parse_cookies(set_cookie_header: str) -> dict:
    """Parse Set-Cookie header into a dict of name -> value."""
    cookies = {}
    if not set_cookie_header:
        return cookies
    for piece in set_cookie_header.split(","):
        # crude split: first segment is "name=value", rest are attrs
        first = piece.strip().split(";", 1)[0]
        if "=" in first:
            k, v = first.split("=", 1)
            cookies[k.strip()] = v.strip()
    return cookies


def setup_test_state() -> dict:
    """Create a user with an org and one asset, return session cookies.

    Returns the cookies dict. Side-effect: the user has one ready asset,
    so listMyOrgs returns [{org, role:'owner'}] and the StoreProvider's
    loadState fetches sidebar-counts + listAssets during hydration.
    """
    print(f"[setup] Registering {TEST_EMAIL}...")
    status, _, cookies = api_post("/api/v1/auth/register", {
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD,
        "displayName": TEST_NAME,
    })
    if status not in (200, 201):
        raise RuntimeError(f"register failed: {status}")
    print(f"        -> {status}, cookies: {list(cookies.keys())}")

    # Need to extract just the session value (api_post parses Set-Cookie).
    session = cookies.get(DEV_COOKIE)
    if not session:
        raise RuntimeError(f"no {DEV_COOKIE} cookie from register: {cookies}")

    print(f"[setup] Creating org {TEST_ORG!r}...")
    status, body, _ = api_post("/api/v1/orgs", {"name": TEST_ORG}, cookies)
    if status != 200:
        raise RuntimeError(f"createOrg failed: {status} {body}")
    org_id = body["data"]["org"]["id"]
    print(f"        -> org {org_id}")

    print(f"[setup] Initiating upload for {TEST_ASSET_NAME!r}...")
    status, body, _ = api_post(
        f"/api/v1/orgs/{org_id}/uploads",
        {
            "filename": TEST_ASSET_NAME,
            "mimeType": "image/png",
            "size": len(TINY_PNG_BYTES),
            "type": "image",
            "format": "PNG",
        },
        cookies,
    )
    if status != 200:
        raise RuntimeError(f"initiate upload failed: {status} {body}")
    asset_id = body["data"]["assetId"]
    upload_url = body["data"]["uploadUrl"]
    print(f"        -> asset {asset_id}")

    print(f"[setup] PUTing {len(TINY_PNG_BYTES)} bytes to S3...")
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
    print(f"        -> {resp.status}")

    print(f"[setup] Finalizing upload...")
    status, body, _ = api_post(
        f"/api/v1/orgs/{org_id}/assets/{asset_id}/finalize",
        {},
        cookies,
    )
    if status != 200:
        raise RuntimeError(f"finalize failed: {status} {body}")
    print(f"        -> status={body['data']['status']}")

    return cookies


def login_via_ui(page: Page, email: str, password: str) -> None:
    """Open the app and log in as an existing user."""
    page.goto(WEB_URL, wait_until="domcontentloaded")
    # Wait for the login screen.
    page.locator("h1", has_text="An archive, organized.").wait_for(
        state="visible", timeout=15_000
    )
    # Default mode is 'login' (no need to click "Register").
    page.locator("#login-email").fill(email)
    page.locator("#login-password").fill(password)
    page.locator("button[type='submit']").click()
    # Wait for the post-login UI to appear.
    page.locator("input[type='search']").wait_for(state="visible", timeout=15_000)
    # Hard reload so StoreProvider hydrates with the new session.
    page.reload(wait_until="domcontentloaded")
    # Wait for hydration — the sidebar shows "已收藏 0" once loadState
    # returns and the App's effect fires the post-hydration
    # sidebar-counts call.
    page.wait_for_timeout(2500)


def main() -> int:
    report: dict = {
        "run_id": RUN_ID,
        "email": TEST_EMAIL,
        "screenshots": [],
        "baseline_count": 0,
        "after_typing_count": 0,
        "after_view_toggle_count": 0,
        "delta_after_typing": 0,
        "delta_after_view_toggle": 0,
        "passed": False,
    }

    # Setup: register a fresh user (gets a session + initial org).
    setup_test_state()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            viewport={"width": 1280, "height": 900},
        )
        # Stub S3 GETs so any thumbnail fetch doesn't 404.
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

        # Track every API call.
        api_calls: list[dict] = []
        t0 = time.time()
        def on_request(req) -> None:  # type: ignore[no-untyped-def]
            api_calls.append({
                "t_ms": int((time.time() - t0) * 1000),
                "method": req.method,
                "url": req.url,
            })
        page.on("request", on_request)
        # Live log.
        page.on("request",
                lambda r: print(f"  REQ {r.method} {r.url[:100]}")
                if "/api/v1/" in r.url else None)

        # 1. Log in via UI, then hard reload for hydration.
        print(f"[1/6] Logging in as {TEST_EMAIL}...")
        login_via_ui(page, TEST_EMAIL, TEST_PASSWORD)

        # 2. Baseline. After login + reload, we expect:
        #    - persistence.ts → sidebar-counts (1 call, from loadState)
        #    - App.tsx effect → sidebar-counts (1 more call, ~500ms later)
        # So baseline should be 2 calls.
        report["baseline_count"] = sum(
            1 for c in api_calls
            if c["method"] == "GET" and "/sidebar-counts" in c["url"]
        )
        report["sidebar_counts_calls"] = [
            c for c in api_calls
            if c["method"] == "GET" and "/sidebar-counts" in c["url"]
        ]
        print(f"[2/6] Baseline: {report['baseline_count']} sidebar-counts calls")
        for c in report["sidebar_counts_calls"]:
            print(f"        {c['t_ms']:>6}ms  {c['method']} {c['url'].replace(API_URL, '')}")

        # 3. Type 'hello' into the search box. Each keystroke fires
        #    SET_SEARCH.
        print("[3/6] Typing 'hello' into the search box...")
        search = page.locator("input[type='search']")
        for ch in "hello":
            search.press(ch)
        page.wait_for_timeout(2000)
        report["after_typing_count"] = sum(
            1 for c in api_calls
            if c["method"] == "GET" and "/sidebar-counts" in c["url"]
        )
        report["delta_after_typing"] = (
            report["after_typing_count"] - report["baseline_count"]
        )
        print(f"      after typing: {report['after_typing_count']} total "
              f"(delta: +{report['delta_after_typing']})")
        page.screenshot(path=str(OUT / "p18-after-typing.png"), full_page=True)
        report["screenshots"].append("p18-after-typing.png")

        # 4. Click the view-mode toggle.
        print("[4/6] Toggling view mode...")
        view_toggle = page.locator(
            "button[aria-label*='列表视图'], button[aria-label*='grid view']"
        ).first
        if view_toggle.count() > 0:
            view_toggle.click()
        else:
            page.get_by_role("button", name=re.compile(r"list|列表", re.I)).first.click()
        page.wait_for_timeout(2000)
        report["after_view_toggle_count"] = sum(
            1 for c in api_calls
            if c["method"] == "GET" and "/sidebar-counts" in c["url"]
        )
        report["delta_after_view_toggle"] = (
            report["after_view_toggle_count"] - report["after_typing_count"]
        )
        print(f"      after view toggle: {report['after_view_toggle_count']} total "
              f"(delta: +{report['delta_after_view_toggle']})")
        page.screenshot(path=str(OUT / "p18-after-view-toggle.png"), full_page=True)
        report["screenshots"].append("p18-after-view-toggle.png")

        # 5. Write the full network trace.
        trace_path = OUT / "p18-network-trace.txt"
        with trace_path.open("w", encoding="utf-8") as f:
            sc = [c for c in api_calls if "/sidebar-counts" in c["url"]]
            f.write(f"Total API calls: {len(api_calls)}\n")
            f.write(f"Sidebar-counts calls: {len(sc)}\n")
            f.write("=" * 80 + "\n")
            f.write(f"{'t_ms':>8}  {'method':<6}  url\n")
            f.write("=" * 80 + "\n")
            for c in api_calls:
                tag = " *" if "/sidebar-counts" in c["url"] else "  "
                f.write(f"{tag} {c['t_ms']:>6}  {c['method']:<6}  "
                        f"{c['url'].replace(API_URL, '')}\n")
        report["trace_file"] = trace_path.name

        # 6. Pass criteria.
        report["passed"] = (
            report["delta_after_typing"] == 0
            and report["delta_after_view_toggle"] == 0
        )
        report["api_calls_summary"] = [
            f"{c['method']} {c['url'].replace(API_URL, '')}" for c in api_calls
        ]

        ctx.close()
        browser.close()

    (OUT / "p18-report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False, default=str),
        encoding="utf-8",
    )
    print("=" * 80)
    print(json.dumps({k: v for k, v in report.items()
                      if k not in ("api_calls_summary", "sidebar_counts_calls")},
                     indent=2, ensure_ascii=False, default=str))
    print("=" * 80)
    print(f"Full trace: {trace_path}")
    print(f"Result: {'PASS' if report['passed'] else 'FAIL'}")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
