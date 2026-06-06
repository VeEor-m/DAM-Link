"""T9 desktop visual verification for the GSAP-animated LoginScreen.

Captures 3 screenshots at 1280x900:
  - t9-desktop-login.png          — after mount entrance finishes (~2s)
  - t9-desktop-register.png       — after switching to register mode (~0.8s)
  - t9-desktop-mid-animation.png  — mid-animation shot of the mount entrance (~0.6s)

Mount entrance timeline (from packages/web/src/lib/animations/login-screen.ts):
  0.00s  corners fade in (0.5s)
  0.15s  meta fades in      (0.5s)
  0.30s  headline fades in  (0.8s)  -> ends 1.10s
  0.55s  sub fades in       (0.5s)
  0.75s  rule scales in     (0.6s)  -> ends 1.35s
  0.95s  fields stagger in  (stagger 0.1, 0.5s) -> last field ends ~1.65s
  1.30s  footer fades in    (0.25s) -> ends 1.55s

Mode-switch timeline:
  sub crossfade           (0.35s)
  name field slide-in     (0.35s, overlapping sub)
"""

from __future__ import annotations

from pathlib import Path

from playwright.sync_api import sync_playwright

URL = "http://localhost:5173/"
OUT = Path(__file__).resolve().parent
VIEWPORT = {"width": 1280, "height": 900}


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            # reduced_motion="no-preference" so the GSAP mount entrance plays.
            context = browser.new_context(
                viewport=VIEWPORT,
                reduced_motion="no-preference",
            )
            page = context.new_page()
            page.goto(URL, wait_until="networkidle")

            # --- Shot 1: login mode, after mount entrance finishes ---
            # Wait long enough for the mount entrance to complete (~1.65s + buffer).
            page.wait_for_timeout(2000)
            page.screenshot(
                path=str(OUT / "t9-desktop-login.png"),
                full_page=True,
            )

            # --- Shot 2: register mode, after the mode-switch timeline ---
            page.get_by_role("button", name="Register").click()
            # Mode switch timeline is ~0.45s; give it 800ms to settle.
            page.wait_for_timeout(800)
            page.screenshot(
                path=str(OUT / "t9-desktop-register.png"),
                full_page=True,
            )

            # --- Shot 3: mid-animation shot of the mount entrance ---
            # Reload to re-trigger the mount entrance, then capture at t=600ms.
            page.goto(URL, wait_until="domcontentloaded")
            # At 600ms: corners done, meta ~90% in, headline ~37% in,
            # sub just starting, rule/fields/footer not yet started.
            page.wait_for_timeout(600)
            page.screenshot(
                path=str(OUT / "t9-desktop-mid-animation.png"),
                full_page=True,
            )
        finally:
            browser.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
