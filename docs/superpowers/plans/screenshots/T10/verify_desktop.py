"""T10 desktop visual verification for the redesigned LoginScreen.

Captures 4 screenshots at 1280x900:
  - t10-desktop-login.png
  - t10-desktop-focus.png
  - t10-desktop-register.png
  - t10-desktop-validation.png
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright, Page

URL = "http://localhost:5173/"
OUT = Path(__file__).resolve().parent
VIEWPORT = {"width": 1280, "height": 900}

# We'll record whether the API was called during the validation step.
api_calls: list[str] = []


def install_request_logger(page: Page) -> None:
    def on_request(req):
        url = req.url
        if "/api/v1/auth/" in url or "/api/v1/auth" in url:
            api_calls.append(f"{req.method} {url}")

    page.on("request", on_request)


def assert_login_mode_visible(page: Page) -> dict:
    # Headline
    h1 = page.locator("h1", has_text="An archive, organized.")
    h1.wait_for(state="visible", timeout=5000)
    headline_size = page.evaluate(
        "(el) => parseFloat(getComputedStyle(el).fontSize)",
        h1.element_handle(),
    )
    headline_family = page.evaluate(
        "(el) => getComputedStyle(el).fontFamily",
        h1.element_handle(),
    )
    # Sub
    sub_text = page.locator("text=Sign in to your library.").first.text_content() or ""
    # Meta
    meta_text = page.locator("text=VOL. 01 / NO. 26 / 2026").first.text_content() or ""
    # Corner marks
    corner_tl = page.locator("text=DAM-Link · est. 2026").first.text_content() or ""
    corner_br = page.locator("text=P. 01 / 01").first.text_content() or ""
    # Footer
    footer_text = page.locator("text=DAM-LINK · A DIGITAL ASSET LIBRARY").first.text_content() or ""
    # Card
    card = page.locator("article").first
    card_box = card.bounding_box()
    card_max_width = page.evaluate(
        "(el) => getComputedStyle(el).maxWidth",
        card.element_handle(),
    )
    card_border_radius = page.evaluate(
        "(el) => getComputedStyle(el).borderRadius",
        card.element_handle(),
    )
    card_border = page.evaluate(
        "(el) => getComputedStyle(el).border",
        card.element_handle(),
    )
    # Switch
    switch_text = page.locator("text=No account?").first.text_content() or ""
    # Button
    button = page.locator("button[type='submit']")
    button_text = button.text_content() or ""
    button_bg = page.evaluate(
        "(el) => getComputedStyle(el).backgroundColor",
        button.element_handle(),
    )
    button_color = page.evaluate(
        "(el) => getComputedStyle(el).color",
        button.element_handle(),
    )
    # Input bottom border
    email_input = page.locator("#login-email")
    email_border = page.evaluate(
        "(el) => getComputedStyle(el).border",
        email_input.element_handle(),
    )
    email_label = page.locator("label[for='login-email']").text_content() or ""
    pw_label = page.locator("label[for='login-password']").text_content() or ""

    return {
        "headline_size_px": headline_size,
        "headline_family": headline_family,
        "sub_text": sub_text.strip(),
        "meta_text": meta_text.strip(),
        "corner_tl": corner_tl.strip(),
        "corner_br": corner_br.strip(),
        "footer_text": footer_text.strip(),
        "card_width_px": card_box["width"] if card_box else None,
        "card_max_width": card_max_width,
        "card_border_radius": card_border_radius,
        "card_border": card_border,
        "switch_text": switch_text.strip(),
        "button_text": button_text.strip(),
        "button_bg": button_bg,
        "button_color": button_color,
        "email_input_border": email_border,
        "email_label": email_label.strip(),
        "pw_label": pw_label.strip(),
    }


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport=VIEWPORT)
        page = ctx.new_page()
        install_request_logger(page)
        page.goto(URL, wait_until="domcontentloaded")
        # Make sure the login screen is visible
        page.locator("h1", has_text="An archive, organized.").wait_for(
            state="visible", timeout=10_000
        )
        # Wait an extra moment for fonts to settle
        page.wait_for_timeout(400)

        # ── Step 2: login mode ──
        info_login = assert_login_mode_visible(page)
        page.screenshot(path=str(OUT / "t10-desktop-login.png"), full_page=False)

        # ── Step 3: focus state ──
        # Tab a few times until we land on the email input
        page.locator("body").click()  # reset focus
        for _ in range(20):
            page.keyboard.press("Tab")
            focused = page.evaluate("document.activeElement?.id || ''")
            if focused == "login-email":
                break
        page.wait_for_timeout(250)
        email_input = page.locator("#login-email")
        focus_border = page.evaluate(
            "(el) => getComputedStyle(el).borderBottomColor + ' / ' + getComputedStyle(el).borderBottomWidth + ' / ' + getComputedStyle(el).boxShadow",
            email_input.element_handle(),
        )
        page.screenshot(path=str(OUT / "t10-desktop-focus.png"), full_page=False)

        # ── Step 4: register mode ──
        # Click the "Register" switch button
        register_btn = page.locator("button", has_text="Register")
        register_btn.click()
        page.wait_for_timeout(300)  # let 180ms animation finish
        name_label = page.locator("label[for='login-name']").text_content() or ""
        sub_register = page.locator("text=Start your collection.").first.text_content() or ""
        button_register = page.locator("button[type='submit']").text_content() or ""
        switch_register = page.locator("text=Have an account?").first.text_content() or ""
        page.screenshot(path=str(OUT / "t10-desktop-register.png"), full_page=False)

        # ── Step 5: client-side validation ──
        # Click the (now "Create account") submit with empty fields
        api_calls.clear()
        page.locator("button[type='submit']").click()
        page.wait_for_timeout(400)
        error_locator = page.locator("p[role='alert']")
        error_visible = error_locator.count() > 0
        error_text = error_locator.first.text_content() if error_visible else ""
        error_color = (
            page.evaluate(
                "(el) => getComputedStyle(el).color",
                error_locator.first.element_handle(),
            )
            if error_visible
            else None
        )
        page.screenshot(path=str(OUT / "t10-desktop-validation.png"), full_page=False)

        ctx.close()
        browser.close()

    report = {
        "login": info_login,
        "focus_border": focus_border,
        "register": {
            "name_label": name_label.strip(),
            "sub": sub_register.strip(),
            "button": button_register.strip(),
            "switch": switch_register.strip(),
        },
        "validation": {
            "error_visible": error_visible,
            "error_text": (error_text or "").strip(),
            "error_color": error_color,
            "api_calls_during_submit": api_calls,
        },
    }
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
