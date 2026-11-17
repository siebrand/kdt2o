"""Browser smoke tests for the meal planner.

The tests serve public/ over HTTP, at the site root and under the GitHub Pages
base path /kdt2o/, and drive the application with Playwright. Fixed plans are
opened through share links, so the tests do not depend on the random recipe
order. Expected values are derived from public/recipes.json.
"""

from __future__ import annotations

import base64
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import math
from pathlib import Path
import re
import threading

import pytest
from playwright.sync_api import Page, expect, sync_playwright


ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
BASE_PATH = "/kdt2o"
RECIPES = json.loads((PUBLIC / "recipes.json").read_text(encoding="utf-8"))
BY_TITLE = {recipe["title"]: recipe for recipe in RECIPES}
MEALS = ["ontbijt", "lunch", "diner"]
EMPTY_STATUS = "Kies een leeg moment om te beginnen."


class StaticHandler(SimpleHTTPRequestHandler):
    """Serve public/ at / and at the GitHub Pages base path."""

    def translate_path(self, path: str) -> str:
        if path == BASE_PATH or path.startswith(BASE_PATH + "/"):
            path = path[len(BASE_PATH):] or "/"
        return super().translate_path(path)

    def end_headers(self) -> None:
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; "
            "form-action 'self'",
        )
        super().end_headers()

    def log_message(self, format: str, *args) -> None:
        pass


@pytest.fixture(scope="session")
def server_url():
    handler = partial(StaticHandler, directory=str(PUBLIC))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        yield browser
        browser.close()


CSP_LISTENER = """
window.__cspViolations = [];
document.addEventListener("securitypolicyviolation", (event) => {
    window.__cspViolations.push(event.violatedDirective + " blocked " + (event.blockedURI || "inline code"));
});
"""


@pytest.fixture
def page(browser):
    context = browser.new_context(accept_downloads=True)
    context.add_init_script(CSP_LISTENER)
    page = context.new_page()
    errors: list[str] = []
    violations: list[str] = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on(
        "console",
        lambda message: violations.append(message.text)
        if message.type == "error" and "Content Security Policy" in message.text
        else None,
    )
    yield page
    if not page.is_closed():
        violations.extend(page.evaluate("window.__cspViolations || []"))
    context.close()
    assert not errors, f"JavaScript errors: {errors}"
    assert not violations, f"Content Security Policy violations: {violations}"


def recipe_token(recipe_id: str) -> str:
    """Mirror recipeToken() in public/app.js."""
    value = 14695981039346656037
    for byte in recipe_id.encode("utf-8"):
        value ^= byte
        value = (value * 1099511628211) & (2**64 - 1)
    value &= (1 << 48) - 1
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
    token = ""
    for _ in range(8):
        token = alphabet[value & 63] + token
        value >>= 6
    return token


def planned_days(recipe: dict, start: int) -> list[int]:
    """Mirror selectionDays() in public/app.js."""
    if not recipe["multiDay"]:
        return [start]
    return [day for day in range(start, start + 2 * recipe.get("days", 3), 2) if day < 7]


def share_url(base: str, plan: dict[tuple[int, str], str]) -> str:
    """Build a share link, keyed by (start day, meal)."""
    slots = [""] * (7 * len(MEALS))
    for (start, meal), title in plan.items():
        recipe = BY_TITLE[title]
        assert recipe["category"] == meal, f"{title} is not a {meal} recipe"
        for day in planned_days(recipe, start):
            slots[day * len(MEALS) + MEALS.index(meal)] = recipe_token(recipe["id"]) + str(start)
    encoded = base64.urlsafe_b64encode(".".join(slots).encode()).decode().rstrip("=")
    return f"{base}/#plan=v4.{encoded}"


def open_planner(page: Page, url: str, status: str | re.Pattern = EMPTY_STATUS) -> None:
    page.goto(url)
    expect(page.locator("#status")).to_have_text(status)


def shopping_list(page: Page) -> list[str]:
    page.locator("#show-shopping-list").click()
    expect(page.locator("#shopping-list-view")).to_be_visible()
    return [text.strip() for text in page.locator("#shopping-list-items li").all_inner_texts()]


@pytest.mark.parametrize("path", ["", BASE_PATH])
def test_planner_shows_only_approved_recipes(page: Page, server_url: str, path: str):
    open_planner(page, f"{server_url}{path}/")
    expect(page.locator("#planner .slot")).to_have_count(7 * len(MEALS))
    expect(page.locator("#show-all-recipes")).to_have_count(0)
    approved = sum(1 for recipe in RECIPES if recipe["approved"])
    expect(page.locator("#single-recipe-results .recipe-card")).to_have_count(approved)


@pytest.mark.parametrize("path", ["", BASE_PATH])
def test_app_displays_local_version(page: Page, server_url: str, path: str):
    open_planner(page, f"{server_url}{path}/")
    expect(page.locator("#app-version")).to_have_text("Versie: Lokale versie")


@pytest.mark.parametrize("path", ["", BASE_PATH])
@pytest.mark.parametrize("page_name", ["changelog.html", "privacy.html"])
def test_static_pages_display_version(page: Page, server_url: str, path: str, page_name: str):
    page.goto(f"{server_url}{path}/{page_name}")
    expect(page.locator("#app-version")).to_have_text("Versie: Lokale versie")


def test_app_displays_calver_version(page: Page, server_url: str):
    version = "2026-11-17.000000000342-" + "a" * 40
    page.route("**/version.txt", lambda route: route.fulfill(body=version))
    open_planner(page, f"{server_url}/")
    expect(page.locator("#app-version")).to_have_text(f"Versie: {version}")


@pytest.mark.parametrize("path", ["", BASE_PATH])
def test_changelog_page_loads(page: Page, server_url: str, path: str):
    page.goto(f"{server_url}{path}/changelog.html")
    expect(page.locator("#changelog-content h1")).to_have_text("Wijzigingen")
    expect(page.locator("#changelog-content")).to_contain_text(
        "De belangrijkste verbeteringen voor de planner en recepten.")
    assert page.locator("#changelog-content h2").all_inner_texts() == [
        "17 november 2026",
        "16 november 2026",
        "13 november 2026",
        "11 november 2026",
        "10 november 2026",
        "9 november 2026",
        "8 november 2026",
        "6 november 2026",
        "5 november 2026",
        "4 november 2026",
        "3 november 2026",
    ]
    entries = page.locator("#changelog-content li").all_inner_texts()
    entry = next(item for item in entries if item.startswith("Bij alle recepten"))
    normalized_entry = " ".join(entry.split())
    assert (
        "Bij sommige ontbijtgerechten staat welke voorbereiding je de dag ervoor kunt doen."
        in normalized_entry
    )


def test_random_fill_persists_and_clears(page: Page, server_url: str):
    open_planner(page, f"{server_url}/")
    page.locator("#random-fill").click()
    planned = re.compile(r"^\d+ maaltijdmomenten gepland\.$")
    expect(page.locator("#status")).to_have_text(planned)
    filled = page.locator("#status").inner_text()

    page.reload()
    expect(page.locator("#status")).to_have_text(filled)

    page.locator("#clear-plan").click()
    expect(page.locator("#status")).to_have_text(EMPTY_STATUS)
    page.reload()
    expect(page.locator("#status")).to_have_text(EMPTY_STATUS)


def planned_titles(page: Page, meal: str) -> list[str]:
    """Return the recipe title of each day for one meal, or "" for an empty slot."""
    titles = []
    for day in range(7):
        slot = page.locator(f'#planner [data-plan-key="{day}-{meal}"]')
        titles.append(slot.locator("strong").inner_text() if slot.locator("strong").count() else "")
    return titles


def test_keyboard_moves_planned_recipe(page: Page, server_url: str):
    first, second = "Zalm in mosterdsaus", "Viscurry met sperziebonen"
    open_planner(page, share_url(server_url, {(0, "diner"): first, (1, "diner"): second}),
                 "2 maaltijdmomenten gepland.")
    expect(page.get_by_role("button", name=f"{first} op maandag naar een eerdere dag verplaatsen")).to_be_disabled()
    expect(page.get_by_role("button", name=f"{second} op dinsdag naar een eerdere dag verplaatsen")).to_be_enabled()

    page.get_by_role("button", name=f"{first} op maandag naar een latere dag verplaatsen").focus()
    page.keyboard.press("Enter")
    assert planned_titles(page, "diner")[:3] == [second, first, ""]
    expect(page.get_by_role("button", name=f"{first} op dinsdag naar een latere dag verplaatsen")).to_be_focused()

    page.keyboard.press("Enter")
    assert planned_titles(page, "diner")[:3] == [second, "", first]
    open_planner(page, f"{server_url}/", "2 maaltijdmomenten gepland.")
    assert planned_titles(page, "diner")[:3] == [second, "", first]


def test_keyboard_moves_multi_day_recipe(page: Page, server_url: str):
    title = "Linzensoep"
    days = BY_TITLE[title]["days"]
    open_planner(page, share_url(server_url, {(0, "lunch"): title}), f"{days} maaltijdmomenten gepland.")
    page.get_by_role("button", name=f"{title} op maandag naar een latere dag verplaatsen").focus()
    page.keyboard.press("Enter")
    expected = ["" for _ in range(7)]
    for day in planned_days(BY_TITLE[title], 1):
        expected[day] = title
    assert planned_titles(page, "lunch") == expected


# Groentemuffins on Tuesday and Thursday cannot move aside for a recipe from Friday, so a drop on Thursday fails and
# a drop on Wednesday swaps with the recipe there.
BLOCKED_BREAKFAST = {
    (1, "ontbijt"): "Groentemuffins",
    (2, "ontbijt"): "Volle kwark met granola en diepvries rood fruit",
    (4, "ontbijt"): "Hüttenkäse met rood-blauw fruit en zelfgemaakte granola",
    (6, "ontbijt"): "Notenbrood met roomkaas en zalm",
}
BLOCKED_BREAKFAST_AFTER_MOVE = [
    "",
    "Groentemuffins",
    "Hüttenkäse met rood-blauw fruit en zelfgemaakte granola",
    "Groentemuffins",
    "Volle kwark met granola en diepvries rood fruit",
    "",
    "Notenbrood met roomkaas en zalm",
]


def test_drag_and_drop_moves_like_the_move_buttons(page: Page, server_url: str):
    open_planner(page, share_url(server_url, BLOCKED_BREAKFAST), "5 maaltijdmomenten gepland.")
    before = planned_titles(page, "ontbijt")
    source = page.locator('#planner [data-plan-key="4-ontbijt"]')
    source.drag_to(page.locator('#planner [data-plan-key="3-ontbijt"]'))
    expect(page.locator(".notification-warning")).to_contain_text("geen ruimte")
    assert planned_titles(page, "ontbijt") == before

    source.drag_to(page.locator('#planner [data-plan-key="2-ontbijt"]'))
    assert planned_titles(page, "ontbijt") == BLOCKED_BREAKFAST_AFTER_MOVE


def test_move_button_skips_a_blocked_day(page: Page, server_url: str):
    open_planner(page, share_url(server_url, BLOCKED_BREAKFAST), "5 maaltijdmomenten gepland.")
    title = BLOCKED_BREAKFAST[(4, "ontbijt")]
    page.get_by_role("button", name=f"{title} op vrijdag naar een eerdere dag verplaatsen").click()
    assert planned_titles(page, "ontbijt") == BLOCKED_BREAKFAST_AFTER_MOVE
    expect(page.get_by_role("button", name=f"{title} op woensdag naar een eerdere dag verplaatsen")).to_be_focused()


def test_move_buttons_are_at_the_bottom_of_the_cell(page: Page, server_url: str):
    open_planner(page, share_url(server_url, BLOCKED_BREAKFAST), "5 maaltijdmomenten gepland.")
    bottoms = page.evaluate("""() => [...document.querySelectorAll('#planner [data-plan-key$="-ontbijt"] .slot-actions')]
        .map((actions) => {
            const card = actions.parentElement;
            const padding = parseFloat(getComputedStyle(card).paddingBottom) + parseFloat(getComputedStyle(card).borderBottomWidth);
            return [Math.round(actions.getBoundingClientRect().bottom),
                    Math.round(card.getBoundingClientRect().bottom - padding)];
        })""")
    assert len(bottoms) == 5
    # Every button row ends at the bottom of its card, and the cards of one row line up.
    assert all(actions == card for actions, card in bottoms)
    assert len({actions for actions, _ in bottoms}) == 1


def test_remove_needs_a_button_and_can_be_undone(page: Page, server_url: str):
    title = "Linzensoep"
    days = BY_TITLE[title]["days"]
    open_planner(page, share_url(server_url, {(0, "lunch"): title}), f"{days} maaltijdmomenten gepland.")
    page.locator('#planner [data-plan-key="0-lunch"] strong').click()
    expect(page.locator("#status")).to_have_text(f"{days} maaltijdmomenten gepland.")

    page.get_by_role("button", name=f"{title} verwijderen van alle dagen").first.click()
    expect(page.locator("#status")).to_have_text(f"{title} is verwijderd.")
    assert planned_titles(page, "lunch") == [""] * 7
    undo = page.get_by_role("button", name="Ongedaan maken")
    expect(undo).to_be_focused()

    page.keyboard.press("Enter")
    expect(page.locator("#status")).to_have_text(f"{days} maaltijdmomenten gepland.")
    expect(undo).to_have_count(0)
    assert planned_titles(page, "lunch").count(title) == days
    open_planner(page, f"{server_url}/", f"{days} maaltijdmomenten gepland.")


def test_shopping_list_bakes_one_cracker_batch_set(page: Page, server_url: str):
    titles = {
        (0, "ontbijt"): "Lijnzaadcrackers en hüttenkäse en avocado",
        (1, "ontbijt"): "Lijnzaadcrackers met boerenkaas",
        (0, "lunch"): "Gegrilde groenten met feta en crackers met kaas & avocado",
    }
    open_planner(page, share_url(server_url, titles), f"{len(titles)} maaltijdmomenten gepland.")
    items = shopping_list(page)

    component = next(
        component
        for recipe in RECIPES
        for component in recipe.get("components", [])
        if component["id"] == "lijnzaadcrackers"
    )
    crackers = sum(
        ingredient["amount"]
        for title in titles.values()
        for ingredient in BY_TITLE[title]["ingredients"]
        if ingredient.get("componentId") == "lijnzaadcrackers"
    )
    batches = math.ceil(crackers / component["yield"])
    flaxseed = next(i for i in component["ingredients"] if i["name"] == "gebroken lijnzaad")
    assert f"{flaxseed['amount'] * batches} gram gebroken lijnzaad" in items
    assert not [item for item in items if "lijnzaadcracker" in item], "crackers must be baked, not bought"


def test_mentioning_granola_does_not_add_a_granola_batch(page: Page, server_url: str):
    title = "Chocolademousse met frambozen"
    open_planner(page, share_url(server_url, {(0, "ontbijt"): title}), "1 maaltijdmomenten gepland.")
    items = " | ".join(shopping_list(page))

    granola = next(
        component
        for recipe in RECIPES
        for component in recipe.get("components", [])
        if component["id"] == "granola"
    )
    own = {ingredient["name"] for ingredient in BY_TITLE[title]["ingredients"]}
    for ingredient in granola["ingredients"]:
        if ingredient["name"] not in own:
            assert ingredient["name"] not in items


def test_pdf_has_landscape_overview_and_recipe_pages(page: Page, server_url: str):
    titles = {
        (0, "diner"): "Zalm in mosterdsaus",
        (1, "diner"): "Viscurry met sperziebonen",
        (2, "diner"): "Zuurkoolpotje met gehakt",
    }
    open_planner(page, share_url(server_url, titles), f"{len(titles)} maaltijdmomenten gepland.")
    shopping_list(page)
    with page.expect_download() as download_info:
        page.locator("#download-pdf").click()
    download = download_info.value
    assert download.suggested_filename == "weekplanning.pdf"
    pdf = Path(download.path()).read_bytes()

    assert pdf.startswith(b"%PDF")
    pages = re.findall(rb"/Type /Page\b(?!s)", pdf)
    assert len(pages) >= 2 + len(titles), "overview, shopping list, and one page per recipe"
    first_box = re.search(rb"/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]", pdf)
    assert first_box and float(first_box.group(1)) > float(first_box.group(2)), "overview is landscape"


def test_single_recipe_pdf_downloads(page: Page, server_url: str):
    recipe = BY_TITLE["Stoofvlees met knolselderij en rode kool"]
    open_planner(page, f"{server_url}/")
    page.locator("#single-recipe-query").fill(recipe["title"])
    card = page.locator("#single-recipe-results .recipe-card", has_text=recipe["title"])
    expect(card).to_have_count(1)
    with page.expect_download() as download_info:
        card.get_by_role("button", name="PDF downloaden").click()
    download = download_info.value
    assert download.suggested_filename == f"{recipe['id']}.pdf"
    pdf = Path(download.path()).read_bytes()
    assert pdf.startswith(b"%PDF")
    assert re.findall(rb"/Type /Page\b(?!s)", pdf), "the PDF has at least one page"
