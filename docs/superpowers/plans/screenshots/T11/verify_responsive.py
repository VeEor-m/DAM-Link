"""T11 responsive visual verification for the redesigned LoginScreen.

Captures screenshots at:
  - 768x1024 (iPad portrait) — login mode       → t11-tablet-login.png
  - 390x844  (iPhone 14)     — login mode       → t11-phone-login.png
  - 390x844                  — register mode    → t11-phone-register.png
  - 768x1024 with reduced-motion — register     → t11-reduced-motion.png
  - 481x800  (corner-mark boundary test)        → t11-corners-481.png

Each step dumps computed-style / geometry facts to stdout in addition to
the screenshot, so the model can read the JSON report and decide pass/fail.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright, Page

URL = "http://localhost:5173/"
OUT = Path(__file__).resolve().parent


def css(el_handle, prop: str):
    return el_handle.evaluate(f"(el) => getComputedStyle(el).getPropertyValue('{prop}')")


def px(el_handle, prop: str) -> float:
    return float(
        el_handle.evaluate(
            f"(el) => parseFloat(getComputedStyle(el).getPropertyValue('{prop}'))"
        )
    )


def get_layout(page: Page) -> dict:
    h1 = page.locator("h1", has_text="An archive, organized.")
    card = page.locator("article").first
    card_box = card.bounding_box()
    h1_size = px(h1.element_handle(), "font-size")
    h1_lh = px(h1.element_handle(), "line-height")
    card_max_w = css(card.element_handle(), "max-width")
    card_pad = css(card.element_handle(), "padding")
    card_pad_top = px(card.element_handle(), "padding-top")
    card_pad_right = px(card.element_handle(), "padding-right")
    card_pad_bottom = px(card.element_handle(), "padding-bottom")
    card_pad_left = px(card.element_handle(), "padding-left")
    card_border_top = css(card.element_handle(), "border-top-width")
    card_border_style = css(card.element_handle(), "border-top-style")
    card_radius = css(card.element_handle(), "border-top-left-radius")
    corner_tl_visible = page.locator("text=DAM-Link · est. 2026").first.is_visible()
    corner_br_visible = page.locator("text=P. 01 / 01").first.is_visible()
    footer_row = page.locator("form > div").last  # .footerRow is the last child of form
    footer_row_flex = css(footer_row.element_handle(), "flex-direction")
    footer_row_box = footer_row.bounding_box()
    # Page horizontal scroll?
    has_h_scroll = page.evaluate(
        "() => document.documentElement.scrollWidth > document.documentElement.clientWidth"
    )
    # Is the page footer (DAM-LINK · A DIGITAL ASSET LIBRARY) below the card?
    page_footer = page.locator("text=DAM-LINK · A DIGITAL ASSET LIBRARY").first
    page_footer_box = page_footer.bounding_box()
    return {
        "viewport": page.viewport_size,
        "headline_px": h1_size,
        "headline_lh_px": h1_lh,
        "card_box": card_box,
        "card_max_width": card_max_w,
        "card_padding": card_pad,
        "card_padding_top_px": card_pad_top,
        "card_padding_right_px": card_pad_right,
        "card_padding_bottom_px": card_pad_bottom,
        "card_padding_left_px": card_pad_left,
        "card_border_top_width": card_border_top,
        "card_border_top_style": card_border_style,
        "card_border_radius": card_radius,
        "corner_tl_visible": corner_tl_visible,
        "corner_br_visible": corner_br_visible,
        "footer_row_flex_direction": footer_row_flex,
        "footer_row_box": footer_row_box,
        "has_horizontal_scroll": has_h_scroll,
        "page_footer_box": page_footer_box,
    }


def main() -> int:
    report: dict = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # ── Step 1: tablet (768×1024) ──
        ctx = browser.new_context(viewport={"width": 768, "height": 1024})
        page = ctx.new_page()
        page.goto(URL, wait_until="domcontentloaded")
        page.locator("h1", has_text="An archive, organized.").wait_for(
            state="visible", timeout=10_000
        )
        page.wait_for_timeout(400)
        info_tablet = get_layout(page)
        page.screenshot(
            path=str(OUT / "t11-tablet-login.png"), full_page=True
        )
        report["tablet_login"] = info_tablet
        ctx.close()

        # ── Step 2: phone (390×844) — login mode ──
        ctx = browser.new_context(viewport={"width": 390, "height": 844})
        page = ctx.new_page()
        page.goto(URL, wait_until="domcontentloaded")
        page.locator("h1", has_text="An archive, organized.").wait_for(
            state="visible", timeout=10_000
        )
        page.wait_for_timeout(400)
        info_phone = get_layout(page)
        page.screenshot(path=str(OUT / "t11-phone-login.png"), full_page=True)
        report["phone_login"] = info_phone

        # ── Step 3: phone (390×844) — register mode ──
        register_btn = page.locator("button", has_text="Register")
        register_btn.click()
        page.wait_for_timeout(300)  # let 180ms animation finish
        name_field_visible = page.locator("#login-name").is_visible()
        sub_register = (
            page.locator("text=Start your collection.").first.text_content() or ""
        )
        button_register = page.locator("button[type='submit']").text_content() or ""
        # Capture the animated field's final opacity (should be 1)
        field_animated = page.locator("form > div").nth(0)  # first child = Name field wrapper
        field_animated_opacity = (
            css(field_animated.element_handle(), "opacity") if name_field_visible else None
        )
        field_animated_anim = (
            css(field_animated.element_handle(), "animation-name") if name_field_visible else None
        )
        page.screenshot(path=str(OUT / "t11-phone-register.png"), full_page=True)
        report["phone_register"] = {
            "name_field_visible": name_field_visible,
            "sub": sub_register.strip(),
            "button": button_register.strip(),
            "field_opacity": field_animated_opacity,
            "field_animation_name": field_animated_anim,
        }
        ctx.close()

        # ── Step 4: reduced motion (768×1024) ──
        ctx = browser.new_context(
            viewport={"width": 768, "height": 1024}, reduced_motion="reduce"
        )
        page = ctx.new_page()
        page.goto(URL, wait_until="domcontentloaded")
        page.locator("h1", has_text="An archive, organized.").wait_for(
            state="visible", timeout=10_000
        )
        page.wait_for_timeout(400)
        # Click Register and check the field is INSTANTLY visible (no animation)
        page.locator("button", has_text="Register").click()
        # Read the computed animation-name on the .fieldAnimated wrapper. With reduced-motion
        # the rule `animation: none` should kick in → animation-name will be "none".
        field_animated = page.locator("form > div").nth(0)
        rm_animation_name = css(field_animated.element_handle(), "animation-name")
        rm_animation_duration = css(field_animated.element_handle(), "animation-duration")
        # Trigger a submit to render the spinner; check spinner's animation-duration
        # The spinner only renders when busy=true (after submit), so we set busy via a slow
        # form submit. Easiest: read the .spinnerCircle's parent .spinner's animation-duration
        # from the *CSS rule* by parsing stylesheets — but that needs JS. Alternative: read
        # directly from the CSS module's reduced-motion override by inspecting a synthetic
        # spinner. Simpler: just confirm the override is in the stylesheet by looking for
        # the reduced-motion media query text. We instead emulate it by injecting a spinner
        # via a quick click on the submit button (it'll fail validation, no spinner). So
        # skip the spinner check via DOM and verify via the CSS file directly later.
        # Capture screenshot
        page.screenshot(path=str(OUT / "t11-reduced-motion.png"), full_page=True)
        report["reduced_motion"] = {
            "field_animation_name": rm_animation_name,
            "field_animation_duration": rm_animation_duration,
        }
        ctx.close()

        # ── Step 5: 481×800 boundary test ──
        ctx = browser.new_context(viewport={"width": 481, "height": 800})
        page = ctx.new_page()
        page.goto(URL, wait_until="domcontentloaded")
        page.locator("h1", has_text="An archive, organized.").wait_for(
            state="visible", timeout=10_000
        )
        page.wait_for_timeout(400)
        info_481 = get_layout(page)
        page.screenshot(path=str(OUT / "t11-corners-481.png"), full_page=True)
        report["corners_481"] = info_481
        ctx.close()

        browser.close()

    print(json.dumps(report, indent=2, ensure_ascii=False, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
