"""Visual verification for reduced-motion + mobile regression on the GSAP-animated LoginScreen."""
from pathlib import Path
from playwright.sync_api import sync_playwright

SCREENSHOT_DIR = Path(__file__).parent
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            # 1. Reduced motion at desktop — should look like the static final state, immediately.
            ctx_reduced = browser.new_context(
                viewport={"width": 1280, "height": 900},
                reduced_motion="reduce",
            )
            page_reduced = ctx_reduced.new_page()
            page_reduced.goto("http://localhost:5173", wait_until="domcontentloaded")
            # Even at 0ms wait, the page should be at its final state (no entrance).
            page_reduced.screenshot(
                path=str(SCREENSHOT_DIR / "t10-reduced-motion.png"),
                full_page=True,
            )
            ctx_reduced.close()

            # 2. Mobile (390x844) — regression check: animations didn't break the existing responsive layout.
            ctx_mobile = browser.new_context(
                viewport={"width": 390, "height": 844},
                reduced_motion="no-preference",
            )
            page_mobile = ctx_mobile.new_page()
            page_mobile.goto("http://localhost:5173", wait_until="networkidle")
            page_mobile.wait_for_timeout(2000)  # wait for mount entrance
            page_mobile.screenshot(
                path=str(SCREENSHOT_DIR / "t10-phone-login.png"),
                full_page=True,
            )
            ctx_mobile.close()

            # 3. Tablet (768x1024) — regression check.
            ctx_tablet = browser.new_context(
                viewport={"width": 768, "height": 1024},
                reduced_motion="no-preference",
            )
            page_tablet = ctx_tablet.new_page()
            page_tablet.goto("http://localhost:5173", wait_until="networkidle")
            page_tablet.wait_for_timeout(2000)
            page_tablet.screenshot(
                path=str(SCREENSHOT_DIR / "t10-tablet-login.png"),
                full_page=True,
            )
            ctx_tablet.close()
        finally:
            browser.close()


if __name__ == "__main__":
    main()
