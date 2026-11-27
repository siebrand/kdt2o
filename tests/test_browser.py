"""Browser smoke tests for the meal planner.

The tests serve public/ over HTTP, at the site root and under the GitHub Pages
base path /kdt2o/, and drive the application with Playwright. Fixed plans are
opened through share links, so the tests do not depend on the random recipe
order. Expected values are derived from public/recipes.json.
"""

from __future__ import annotations

import base64
import json
import math
import pytest
import re
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import Page, expect, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
BASE_PATH = "/kdt2o"
RECIPES = json.loads((PUBLIC / "recipes.json").read_text(encoding="utf-8"))
BY_TITLE = {recipe["title"]: recipe for recipe in RECIPES}
MEALS = ["ontbijt", "lunch", "diner"]
EMPTY_STATUS = "Kies een leeg moment om te beginnen."
# The tests send the production policy, so a page that only works with a weaker policy fails here too.
PRODUCTION_CSP = re.search(
    r'add_header Content-Security-Policy "([^"]+)"',
    (ROOT / "nginx" / "security-headers.conf").read_text(encoding="utf-8"),
).group(1)


class StaticHandler(SimpleHTTPRequestHandler):
    """Serve public/ at / and at the GitHub Pages base path."""

    def translate_path(self, path: str) -> str:
        if path == BASE_PATH or path.startswith(BASE_PATH + "/"):
            path = path[len(BASE_PATH):] or "/"
        return super().translate_path(path)

    def end_headers(self) -> None:
        self.send_header("Content-Security-Policy", PRODUCTION_CSP)
        super().end_headers()

    def log_message(self, format: str, *args) -> None:
        pass


class StaticServer(ThreadingHTTPServer):
    # The default of 5 waiting connections is too few for a page that loads many modules at once.
    request_queue_size = 128


@pytest.fixture(scope="session")
def server_url():
    handler = partial(StaticHandler, directory=str(PUBLIC))
    server = StaticServer(("127.0.0.1", 0), handler)
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

MOCK_WAKE_LOCK = """
window.__wakeLockRequests = [];
window.__wakeLockSentinels = [];
Object.defineProperty(navigator, "wakeLock", {
    configurable: true,
    value: {
        request: async (type) => {
            window.__wakeLockRequests.push(type);
            const listeners = [];
            const sentinel = {
                released: false,
                listeners,
                addEventListener: (name, listener) => {
                    if (name === "release") listeners.push(listener);
                },
                release: () => {
                    sentinel.released = true;
                    listeners.forEach((listener) => listener());
                    return Promise.resolve();
                }
            };
            window.__wakeLockSentinels.push(sentinel);
            return sentinel;
        }
    }
});
window.__simulateSystemWakeLockRelease = () => {
    const sentinel = window.__wakeLockSentinels.at(-1);
    if (!sentinel) return;
    sentinel.released = true;
    sentinel.listeners.forEach((listener) => listener());
};
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
    """Mirror recipeToken() in public/plan.js."""
    value = 14695981039346656037
    for byte in recipe_id.encode("utf-8"):
        value ^= byte
        value = (value * 1099511628211) & (2 ** 64 - 1)
    value &= (1 << 48) - 1
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
    token = ""
    for _ in range(8):
        token = alphabet[value & 63] + token
        value >>= 6
    return token


def planned_days(recipe: dict, start: int) -> list[int]:
    """Mirror selectionDays() in public/planning.js."""
    if not recipe["multiDay"]:
        return [start]
    return [day for day in range(start, start + 2 * recipe.get("days", 3), 2) if day < 7]


def share_url(base: str, plan: dict[tuple[int, str], str]) -> str:
    """Build a share link, keyed by (start day, meal)."""
    slots = [""] * (7 * len(MEALS))
    for (start, meal), title in plan.items():
        recipe = BY_TITLE[title]
        assert meal in recipe["categories"], f"{title} is not a {meal} recipe"
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


def test_planner_stacks_days_on_narrow_screens_and_preserves_week_grid(page: Page, server_url: str):
    page.set_viewport_size({"width": 390, "height": 844})
    plan = {
        (0, "ontbijt"): "Groentemuffins",
        (0, "lunch"): "Linzensoep",
        (0, "diner"): "Zalm in mosterdsaus",
        (1, "diner"): "Viscurry met sperziebonen",
    }
    meal_count = sum(len(planned_days(BY_TITLE[title], start_day)) for (start_day, _), title in plan.items())
    open_planner(page, share_url(server_url, plan), f"{meal_count} maaltijdmomenten gepland.")

    mobile = page.evaluate("""() => {
        const planner = document.querySelector("#planner");
        const groups = [...planner.querySelectorAll(".planner-day")];
        return {
            width: planner.clientWidth,
            scrollWidth: planner.scrollWidth,
            days: groups.map((group) => ({
                name: group.querySelector(".day").textContent,
                meals: [...group.querySelectorAll(".planner-cell[data-meal]")]
                    .map((cell) => cell.querySelector(".planner-meal-name").textContent)
            }))
        };
    }""")
    assert mobile["scrollWidth"] <= mobile["width"]
    assert len(mobile["days"]) == 7
    assert all(day["meals"] == ["Ontbijt", "Lunch", "Diner"] for day in mobile["days"])
    today_button = page.get_by_role("button", name="Vandaag")
    expect(today_button).to_be_visible()
    today_index = (page.evaluate("new Date().getDay()") + 6) % 7
    today_button.click()
    expect(page.locator("#planner .planner-day").nth(today_index)).to_be_in_viewport()
    long_title = page.locator('#planner [data-plan-key="0-ontbijt"] strong').evaluate("""title => {
        title.textContent = "langereceptnaamzonderspatiesdieandersbuitenhetvakloopt";
        return {
            hyphens: getComputedStyle(title).hyphens,
            width: title.clientWidth,
            scrollWidth: title.scrollWidth
        };
    }""")
    assert long_title["hyphens"] == "auto"
    assert long_title["scrollWidth"] <= long_title["width"]

    page.set_viewport_size({"width": 1280, "height": 900})
    expect(today_button).not_to_be_visible()
    columns = page.evaluate("""() => [...document.querySelectorAll(".planner-day")].map((group) => {
        const header = group.querySelector(".day").getBoundingClientRect();
        const breakfast = group.querySelector('[data-meal="ontbijt"]').getBoundingClientRect();
        return [header.left, breakfast.left, breakfast.top];
    })""")
    assert all(abs(header_left - meal_left) <= 1 for header_left, meal_left, _ in columns)
    assert all(columns[index][0] < columns[index + 1][0] for index in range(6))
    assert len({round(column[2]) for column in columns}) == 1


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
        "27 november 2026",
        "25 november 2026",
        "24 november 2026",
        "23 november 2026",
        "21 november 2026",
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


HOSTILE_CHANGELOG = """# Wijzigingen

## 1 januari 2026

- <img src=x id="injected-image"> en <script id="injected-script">window.injected = true</script>
- [Gevaarlijke koppeling](javascript:window.injected=true) en **vet**
- [Veilige koppeling](https://example.com/" onmouseover="window.injected=true)
"""


def test_changelog_renders_markdown_as_text_not_html(page: Page, server_url: str):
    page.route("**/CHANGELOG.md", lambda route: route.fulfill(body=HOSTILE_CHANGELOG, content_type="text/markdown"))
    page.goto(f"{server_url}/changelog.html")
    content = page.locator("#changelog-content")
    expect(content.locator("h2")).to_have_text("1 januari 2026")
    expect(content).to_contain_text('<img src=x id="injected-image">')
    expect(content.locator("img, script, [onmouseover]")).to_have_count(0)
    expect(content.locator("strong")).to_have_text("vet")
    # Only http and https links become links; the quote cannot leave the href attribute.
    expect(content.locator("a")).to_have_count(1)
    assert content.locator("a").get_attribute("href").startswith("https://example.com/")
    expect(content).to_contain_text("[Gevaarlijke koppeling](javascript:window.injected=true)")
    assert page.evaluate("window.injected") is None


NESTED_CHANGELOG = """# Wijzigingen

- Eerste punt dat
  doorloopt
  - Recept <b>een</b>
  - **Recept** twee met een
    lange naam
- Tweede punt
"""


def test_changelog_renders_nested_lists(page: Page, server_url: str):
    page.route("**/CHANGELOG.md", lambda route: route.fulfill(body=NESTED_CHANGELOG, content_type="text/markdown"))
    page.goto(f"{server_url}/changelog.html")
    top = page.locator("#changelog-content > ul > li")
    expect(top).to_have_count(2)
    expect(page.locator("#changelog-content > ul")).to_have_count(1)
    nested = top.first.locator("> ul > li")
    expect(nested).to_have_text(["Recept <b>een</b>", "Recept twee met een lange naam"])
    expect(top.first.locator("b")).to_have_count(0)
    assert top.first.evaluate("item => item.firstChild.textContent") == "Eerste punt dat doorloopt"
    expect(top.last).to_have_text("Tweede punt")


def test_recipe_with_several_categories_is_offered_for_each_meal(page: Page, server_url: str):
    recipes = json.loads(json.dumps(RECIPES))
    recipe = next(r for r in recipes if r["approved"] and r["categories"] == ["diner"] and not r["multiDay"])
    recipe["categories"] = ["lunch", "diner"]
    page.route("**/recipes.json", lambda route: route.fulfill(
        body=json.dumps(recipes, ensure_ascii=False), content_type="application/json"))
    open_planner(page, f"{server_url}/")
    for meal, offered in (("lunch", True), ("diner", True), ("ontbijt", False)):
        page.locator(f'#planner [data-plan-key="0-{meal}"]').click()
        options = page.locator("#recipe-options")
        expect(options).to_be_visible()
        if offered:
            expect(options).to_contain_text(recipe["title"])
        else:
            expect(options).not_to_contain_text(recipe["title"])


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


def test_share_link_does_not_undo_edits_on_reload(page: Page, server_url: str):
    link = share_url(server_url, {(0, "diner"): "Zalm in mosterdsaus", (1, "diner"): "Viscurry met sperziebonen"})
    open_planner(page, link, "2 maaltijdmomenten gepland.")
    # Opening a link does not change the saved plan, so the link stays until the first change.
    assert page.url == link
    assert page.evaluate("localStorage.getItem('kitano-weekplan')") is None

    page.get_by_role("button", name="Zalm in mosterdsaus verwijderen").first.click()
    assert page.url == f"{server_url}/"
    page.reload()
    expect(page.locator("#status")).to_have_text("1 maaltijdmomenten gepland.")
    assert planned_titles(page, "diner").count("Viscurry met sperziebonen") == 1

    page.goto("about:blank")
    open_planner(page, link, "2 maaltijdmomenten gepland.")
    page.locator("#clear-plan").click()
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
    expect(page.locator("#recipe-dialog")).to_be_visible()
    expect(page.locator("#recipe-dialog-title")).to_have_text(title)
    page.locator("#recipe-dialog-close").click()
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


def test_shopping_list_shows_the_total_whatever_the_recipe_order(page: Page, server_url: str):
    # "halve komkommer" comes first. The list once normalized the total again from that text and showed half a
    # cucumber, rounded up to 1, instead of the total of 0.5 + 1 + 0.2.
    titles = {
        (0, "ontbijt"): "Notenbrood met roomkaas en zalm",
        (0, "lunch"): "Griekse salade",
        (1, "ontbijt"): "Omelet met geelwortel",
    }
    open_planner(page, share_url(server_url, titles), "3 maaltijdmomenten gepland.")
    assert [item for item in shopping_list(page) if item.endswith("komkommer")] == ["2 stuk komkommer"]


@pytest.mark.parametrize(("plural", "singular"), [
    ("citroenen", "citroen"),
    ("Courgettes", "courgette"),
    ("rode uien", "rode ui"),
    ("bouillonblokjes", "bouillonblokje"),
    ("wortelen", "wortel"),
    ("paprika's", "paprika"),
    ("bruien", "bruien"),
])
def test_shopping_names_use_the_singular(page: Page, server_url: str, plural: str, singular: str):
    page.goto(server_url)
    normalize = """async (name) => {
        const shopping = await import(new URL("shopping.js", document.baseURI).href);
        return shopping.normalizeShoppingName(name);
    }"""
    assert page.evaluate(normalize, plural) == singular


def shopping_list_by_section(page: Page) -> dict[str, list[str]]:
    """Return the shopping list items, split into needed items and the items under "Optioneel"."""
    page.locator("#show-shopping-list").click()
    expect(page.locator("#shopping-list-view")).to_be_visible()
    rows = page.locator("#shopping-list-items li").evaluate_all(
        "(rows) => rows.map((row) => [row.parentElement.previousElementSibling?.tagName === 'H4', row.textContent.trim()])")
    return {
        "needed": [text for optional, text in rows if not optional],
        "optional": [text for optional, text in rows if optional],
    }


@pytest.mark.parametrize("pizza_day", [0, 1], ids=["optional-first", "needed-first"])
def test_needed_and_optional_amounts_stay_apart(page: Page, server_url: str, pizza_day: int):
    # Bloemkoolpizza has champignons as an optional topping; the frittata needs them.
    titles = {(pizza_day, "diner"): "Bloemkoolpizza", (1 - pizza_day, "lunch"): "Frittata met champignons en kaas"}
    open_planner(page, share_url(server_url, titles), "2 maaltijdmomenten gepland.")
    sections = shopping_list_by_section(page)
    assert [item for item in sections["needed"] if item.endswith(" champignons")] == ["250 gram champignons"]
    assert [item for item in sections["optional"] if item.endswith(" champignons")] == ["100 gram champignons"]


def test_recipe_subrecipe_ingredients_are_counted_once(page: Page, server_url: str):
    title = "Pesto kip met snijbonen en tuinerwtjes"
    open_planner(page, share_url(server_url, {(0, "diner"): title}), "1 maaltijdmomenten gepland.")
    items = shopping_list(page)
    # The pesto ingredients come from the subrecipe only; the olive oil adds 30 ml for the chicken and 15 ml pesto.
    for expected in ("1 teen knoflook", "40 gram pijnboompitten", "30 gram verse basilicum",
                     "30 gram Parmezaanse kaas", "45 ml extra vierge olijfolie"):
        name = expected.split(" ", 2)[2]
        assert [item for item in items if item.endswith(" " + name)] == [expected], (expected, items)


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


def test_cooking_mode_releases_wake_lock_when_disabled_or_recipe_closes(page: Page, server_url: str):
    page.add_init_script(MOCK_WAKE_LOCK)
    title = "Zalm in mosterdsaus"
    open_planner(page, share_url(server_url, {(0, "diner"): title}), "1 maaltijdmomenten gepland.")
    page.locator('#planner [data-plan-key="0-diner"] strong').click()

    toggle = page.locator("#cooking-mode-toggle")
    toggle.click()
    expect(page.locator("#cooking-mode-status")).to_have_text(
        "Kookmodus staat aan. Het scherm blijft wakker zolang deze pagina zichtbaar is."
    )
    assert page.evaluate("window.__wakeLockRequests") == ["screen"]

    toggle.click()
    expect(page.locator("#cooking-mode-status")).to_have_text("Kookmodus is uitgeschakeld.")
    assert page.evaluate("window.__wakeLockSentinels[0].released")

    toggle.click()
    expect(page.locator("#cooking-mode-status")).to_contain_text("Kookmodus staat aan")
    page.locator("#recipe-dialog-close").click()
    expect(page.locator("#cooking-mode-status")).to_have_text("Kookmodus is uitgeschakeld.")
    assert page.evaluate("window.__wakeLockSentinels[1].released")


def test_cooking_mode_reacquires_wake_lock_when_page_becomes_visible(page: Page, server_url: str):
    page.add_init_script(MOCK_WAKE_LOCK)
    title = "Zalm in mosterdsaus"
    open_planner(page, share_url(server_url, {(0, "diner"): title}), "1 maaltijdmomenten gepland.")
    page.locator('#planner [data-plan-key="0-diner"] strong').click()
    page.locator("#cooking-mode-toggle").click()
    expect(page.locator("#cooking-mode-status")).to_contain_text("Kookmodus staat aan")

    page.evaluate("window.__simulateSystemWakeLockRelease(); document.dispatchEvent(new Event('visibilitychange'))")
    expect(page.locator("#cooking-mode-status")).to_have_text(
        "Kookmodus staat aan. Het scherm blijft wakker zolang deze pagina zichtbaar is."
    )
    assert page.evaluate("window.__wakeLockRequests") == ["screen", "screen"]


def test_cooking_mode_reports_when_wake_lock_is_unsupported(page: Page, server_url: str):
    page.add_init_script('Object.defineProperty(navigator, "wakeLock", {configurable: true, value: undefined})')
    title = "Zalm in mosterdsaus"
    open_planner(page, share_url(server_url, {(0, "diner"): title}), "1 maaltijdmomenten gepland.")
    page.locator('#planner [data-plan-key="0-diner"] strong').click()
    page.locator("#cooking-mode-toggle").click()

    expect(page.locator("#cooking-mode-status")).to_have_text(
        "Kookmodus wordt niet ondersteund door deze browser."
    )
    expect(page.locator("#cooking-mode-toggle")).to_have_attribute("aria-pressed", "false")


def test_recipe_opens_as_html_without_hijacking_buttons(page: Page, server_url: str):
    title = "Zalm in mosterdsaus"
    open_planner(page, share_url(server_url, {(0, "diner"): title}), "1 maaltijdmomenten gepland.")

    slot = page.locator('#planner [data-plan-key="0-diner"]')
    slot.locator("strong").click()
    expect(page.locator("#recipe-dialog")).to_be_visible()
    expect(page.locator("#recipe-dialog-title")).to_have_text(title)
    expect(page.locator("#recipe-dialog-content")).to_contain_text("Ingrediënten")
    page.locator("#recipe-dialog-close").click()

    page.get_by_role("button", name=f"{title} op maandag naar een latere dag verplaatsen").click()
    expect(page.locator("#recipe-dialog")).not_to_be_visible()


def method_steps_in_dialog(page: Page) -> list[tuple[str, str]]:
    """Return (number, text) of each method step in the recipe dialog; a tip has no number."""
    return page.locator("#recipe-dialog-content ol li").evaluate_all(
        "(rows) => rows.map((row) => [row.classList.contains('recipe-tip') ? '' : String(row.value), row.textContent])")


@pytest.mark.parametrize("title", ["Stoofvlees met knolselderij en rode kool", "Pesto kip met snijbonen en tuinerwtjes"])
def test_recipe_dialog_numbers_each_step_once(page: Page, server_url: str, title: str):
    open_planner(page, f"{server_url}/")
    page.locator("#single-recipe-query").fill(title)
    page.locator("#single-recipe-results .recipe-card", has_text=title).locator("h3").click()
    expect(page.locator("#recipe-dialog")).to_be_visible()
    steps = method_steps_in_dialog(page)
    numbers = [number for number, _ in steps if number]
    # The list draws the numbers; they run on across the subrecipe and main method sections.
    assert numbers == [str(index) for index in range(1, len(numbers) + 1)]
    assert len(numbers) > 4
    assert not [text for _, text in steps if re.match(r"\d+\.", text)], "step text must not repeat the number"
    assert all(text.startswith("Tip:") for number, text in steps if not number)


def test_recipe_source_is_linked_in_the_dialog_and_the_pdf(page: Page, server_url: str):
    recipes = json.loads(json.dumps(RECIPES))
    recipe = next(r for r in recipes if r["approved"] and not r["multiDay"])
    url = "https://www.koolhydraatarmrecept.nl/voorbeeld-recept/"
    recipe["source"] = {"name": "koolhydraatarmrecept.nl", "url": url}
    page.route("**/recipes.json", lambda route: route.fulfill(
        body=json.dumps(recipes, ensure_ascii=False), content_type="application/json"))
    open_planner(page, f"{server_url}/")
    page.locator("#single-recipe-query").fill(recipe["title"])
    card = page.locator("#single-recipe-results .recipe-card", has_text=recipe["title"])
    card.locator("h3").click()
    source = page.locator("#recipe-dialog-content .recipe-dialog-source")
    expect(source).to_have_text("Bron: koolhydraatarmrecept.nl")
    expect(source.locator("a")).to_have_attribute("href", url)
    expect(source.locator("a")).to_have_attribute("rel", "noopener noreferrer")
    page.locator("#recipe-dialog-close").click()

    with page.expect_download() as download_info:
        card.get_by_role("button", name="PDF downloaden").click()
    pdf = Path(download_info.value.path()).read_bytes()
    assert f"/URI ({url})".encode() in pdf

    meal = recipe["categories"][0]
    # A share link that only changes the hash does not reload the page.
    page.goto("about:blank")
    open_planner(page, share_url(server_url, {(0, meal): recipe["title"]}), "1 maaltijdmomenten gepland.")
    page.locator("#show-shopping-list").click()
    with page.expect_download() as download_info:
        page.locator("#download-pdf").click()
    assert f"/URI ({url})".encode() in Path(download_info.value.path()).read_bytes()


def test_recipe_without_source_has_no_source_line(page: Page, server_url: str):
    title = "Zalm in mosterdsaus"
    recipes = [{key: value for key, value in recipe.items() if key != "source"} for recipe in RECIPES]
    page.route("**/recipes.json", lambda route: route.fulfill(
        body=json.dumps(recipes, ensure_ascii=False), content_type="application/json"))
    open_planner(page, f"{server_url}/")
    page.locator("#single-recipe-query").fill(title)
    page.locator("#single-recipe-results .recipe-card", has_text=title).locator("h3").click()
    expect(page.locator("#recipe-dialog")).to_be_visible()
    expect(page.locator("#recipe-dialog-content .recipe-dialog-source")).to_have_count(0)


def test_every_recipe_credits_its_source():
    missing = [recipe["id"] for recipe in RECIPES if not recipe.get("source")]
    assert missing == []


def test_single_recipe_card_opens_html_but_pdf_button_downloads(page: Page, server_url: str):
    recipe = BY_TITLE["Stoofvlees met knolselderij en rode kool"]
    open_planner(page, f"{server_url}/")
    page.locator("#single-recipe-query").fill(recipe["title"])
    card = page.locator("#single-recipe-results .recipe-card", has_text=recipe["title"])

    bottoms = card.evaluate("""(card) => {
        const pdfArea = card.querySelector(".single-recipe-pdf-area");
        const padding = parseFloat(getComputedStyle(card).paddingBottom);
        return [Math.round(pdfArea.getBoundingClientRect().bottom),
                Math.round(card.getBoundingClientRect().bottom - padding)];
    }""")
    assert abs(bottoms[0] - bottoms[1]) <= 1, "PDF action is at the bottom of the recipe card"

    card.locator("h3").click()
    expect(page.locator("#recipe-dialog")).to_be_visible()
    expect(page.locator("#recipe-dialog-title")).to_have_text(recipe["title"])
    page.locator("#recipe-dialog-close").click()

    with page.expect_download() as download_info:
        card.get_by_role("button", name="PDF downloaden").click()
    assert download_info.value.suggested_filename == f"{recipe['id']}.pdf"
    expect(page.locator("#recipe-dialog")).not_to_be_visible()
