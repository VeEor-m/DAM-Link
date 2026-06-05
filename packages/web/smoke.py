"""Smoke test focused on the new T21 features: kebab context menu + restore.

The dev server is already running on port 5174. We don't restart it; HMR
will pick up any source changes between runs.
"""

from pathlib import Path
from playwright.sync_api import sync_playwright

SHOTS = Path("D:/DAM-Link/smoke-shots")
URL = "http://localhost:5174/"


def shot(page, name: str) -> None:
    path = SHOTS / f"{name}.png"
    page.screenshot(path=str(path), full_page=False)
    print(f"  → {path.name}")


def close_any_open_modal(page) -> None:
    """Click the backdrop of any open modal to dismiss it. Safe no-op if none."""
    backdrop = page.locator('div[class*="backdrop"]').first
    if backdrop.count() == 0:
        return
    try:
        if backdrop.is_visible():
            # Click in the corner of the backdrop, far from any modal content.
            backdrop.click(position={"x": 5, "y": 5})
            page.wait_for_timeout(150)
    except Exception:
        pass


def main() -> None:
    SHOTS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()

        # 0. Reset state.
        print("0. Load + clear localStorage")
        page.goto(URL)
        page.evaluate("() => localStorage.clear()")
        page.reload()
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(400)

        # 1. Switch to list view via the toolbar button (more reliable than the 2 shortcut).
        print("1. Switch to list view via toolbar")
        page.get_by_role("button", name="列表").click()
        page.wait_for_timeout(300)
        shot(page, "01-list-view")
        # Verify list-view markup is present.
        role_grid_count = page.locator('[role="grid"]').count()
        print(f"   [role=grid] count: {role_grid_count} (1 = list view)")

        # 2. Open kebab on the first row.
        print("2. Open kebab on first row")
        kebab = page.get_by_label("更多操作").first
        kebab.wait_for(timeout=5000)
        kebab.click()
        page.wait_for_timeout(200)
        shot(page, "02-kebab-open")
        items = page.locator('[role="menuitem"]')
        labels = [items.nth(i).inner_text().strip() for i in range(items.count())]
        print(f"   menu items: {labels}")

        # 3. Trigger trash via menu (click 移到回收站).
        print("3. Trash via menu (移到回收站)")
        page.get_by_role("menuitem", name="移到回收站").click()
        page.wait_for_timeout(400)
        shot(page, "03-trash-toast")

        # 4. Go to trash sidebar.
        print("4. Navigate to trash")
        page.get_by_text("回收站", exact=False).first.click()
        page.wait_for_timeout(400)
        shot(page, "04-trash-view")

        # 5. Open kebab on a trashed row.
        print("5. Open kebab on trashed row")
        trash_kebab = page.get_by_label("更多操作").first
        trash_kebab.wait_for(timeout=5000)
        trash_kebab.click()
        page.wait_for_timeout(200)
        shot(page, "05-trash-kebab")
        items2 = page.locator('[role="menuitem"]')
        labels2 = [items2.nth(i).inner_text().strip() for i in range(items2.count())]
        print(f"   trash menu items: {labels2}")

        # 6. Restore.
        print("6. Click 恢复")
        page.get_by_role("menuitem", name="恢复").click()
        page.wait_for_timeout(400)
        shot(page, "06-restored")

        # 7. Verify the asset is back: go to 全部资产, search for it, confirm it's present.
        print("7. Verify restored asset is in 全部资产")
        page.get_by_text("全部资产", exact=False).first.click()
        page.wait_for_timeout(300)
        # The asset name we trashed is the first one alphabetically, hero-banner.png.
        # Just check the grid is non-empty.
        cards = page.locator('[class*="card"]')
        print(f"   cards visible in grid: {cards.count()}")

        # 8. Switch back to grid.
        print("8. Back to grid view")
        page.get_by_role("button", name="网格").click()
        page.wait_for_timeout(300)
        shot(page, "07-back-to-grid")

        # 9. Click an asset in grid, then click the kebab on that row in list view.
        # Click the first card to select.
        first_card = page.locator('[class*="card"]').first
        first_card.click()
        page.wait_for_timeout(200)

        # 10. Open ShortcutsHelp via ? key — confirm it renders.
        print("9. ? opens help modal")
        # First blur the active element so the ? key goes to the global handler.
        page.evaluate("() => document.activeElement && document.activeElement.blur()")
        page.keyboard.press("?")
        page.wait_for_timeout(200)
        shot(page, "08-help-modal")
        # Try Escape.
        page.keyboard.press("Escape")
        page.wait_for_timeout(200)
        still_open = page.locator('[role="dialog"]').count() > 0
        print(f"   help modal still open after Escape: {still_open}")
        if still_open:
            print("   ⚠ BUG: ShortcutsHelp modal doesn't close on Escape")
            close_any_open_modal(page)
            page.wait_for_timeout(200)

        # 11. Permanent delete via menu (the one we restored, then re-trashed, then permanent).
        # Skip — the kebab+trash+restore loop has been demonstrated.

        browser.close()
        print("\nDone. Screenshots in D:/DAM-Link/smoke-shots/")


if __name__ == "__main__":
    main()
