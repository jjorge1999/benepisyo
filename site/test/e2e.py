"""End-to-end test of the Benepisyo site on a phone-sized screen.
Usage: python3 test/e2e.py http://localhost:8765 <screenshot-dir>
"""
import asyncio
import os
import sys

from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765"
SHOTS = sys.argv[2] if len(sys.argv) > 2 else "shots"
os.makedirs(SHOTS, exist_ok=True)
failures = []


def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)


async def no_overflow(page, label):
    w = await page.evaluate("[document.documentElement.scrollWidth, window.innerWidth]")
    check(w[0] <= w[1], f"{label}: no horizontal scroll ({w[0]} <= {w[1]})")


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="fil-PH")
        page = await ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "fonts.g" not in m.text and "Failed to load resource" not in m.text else None)

        # 1. Home, first visit
        await page.goto(BASE + "/")
        await page.wait_for_selector("#city-next")
        await page.screenshot(path=f"{SHOTS}/01-home.png")
        await no_overflow(page, "home")

        # 2. City
        await page.fill("#city-input", "Calamba")
        check(await page.is_visible("text=Kumpleto ang lokal na benepisyo dito."), "Calamba recognised as supported")
        await page.click("#city-next")

        # 3. Who: for family member Nanay, senior
        await page.click('[data-self="0"]')
        await page.fill("#who-name", "Nanay")
        await page.click('[data-group="senior"]')
        await page.screenshot(path=f"{SHOTS}/02-who.png")
        await page.click("#who-next")

        # 4. Questions
        title = await page.text_content("#q-title")
        check(title.strip() == "Ilang taon na si Nanay?", f"age question uses the name ({title.strip()})")
        await page.click("text=60 hanggang 79")
        title = await page.text_content("#q-title")
        check("Nakatira ba si Nanay sa Calamba?" in title, f"resident question ({title.strip()})")
        await page.click('.choice:has-text("Oo")')
        await page.click("text=Minimum wage pababa, o walang regular na kita")
        await page.click('.choice:has-text("Hindi")')  # no pension
        title = await page.text_content("#q-title")
        check("Alin ang mayroon na si Nanay?" in title, f"documents question ({title.strip()})")
        await page.click('[data-doc="__none"]')
        await page.screenshot(path=f"{SHOTS}/03-docs.png")
        await page.click("#q-done")

        # 5. Results
        await page.wait_for_selector(".unlock")
        text = await page.inner_text("#app")
        check("Para kay Nanay" in text, "results heading names the person")
        check("Puwede nang kunin" in text and "Kailangan muna ng" in text, "results split into ready and blocked")
        check("Kumuha muna ng Senior Citizen ID" in text, "blocked group names the missing ID")
        check("Social pension" in text, "indigent senior without pension sees social pension")
        await page.screenshot(path=f"{SHOTS}/04-results.png", full_page=True)
        await no_overflow(page, "results")

        # 6. Family view
        await page.click("#to-family")
        await page.wait_for_selector(".person")
        check(await page.locator(".person").count() == 1, "family list has 1 person")
        await page.screenshot(path=f"{SHOTS}/05-family.png")

        # 7. Detail page of the birthday cash gift
        await page.goto(BASE + "/calamba/calamba-senior-birthday-cash/")
        await page.wait_for_selector(".why-box")
        why = await page.inner_text(".why-box")
        check("Bakit qualified si Nanay" in why, "detail shows why the person qualifies")
        check(await page.is_visible("text=Ulat, hindi pa kumpirmado"), "reported badge shown for news-only benefit")
        await page.screenshot(path=f"{SHOTS}/06-detail.png", full_page=True)
        await no_overflow(page, "detail")

        # 8. Plan my visit
        await page.click("#plan-visit")
        await page.wait_for_function("document.querySelector('#card-img') && document.querySelector('#card-img').naturalWidth > 0", timeout=10000)
        dims = await page.evaluate("[document.querySelector('#card-img').naturalWidth, document.querySelector('#card-img').naturalHeight]")
        check(dims[0] == 1080 and dims[1] > 1000, f"visit card rendered ({dims[0]}x{dims[1]})")
        await page.screenshot(path=f"{SHOTS}/07-visit-sheet.png")
        size = await page.evaluate("fetch(document.querySelector('#card-img').src).then(r=>r.blob()).then(b=>b.size)")
        check(size < 300 * 1024, f"visit card under 300 KB ({size // 1024} KB)")
        card = await page.evaluate("fetch(document.querySelector('#card-img').src).then(r=>r.arrayBuffer()).then(b=>Array.from(new Uint8Array(b)))")
        with open(f"{SHOTS}/08-visit-card.png", "wb") as f:
            f.write(bytes(card))
        await page.click("#sheet-close")
        visits = await page.evaluate("JSON.parse(localStorage.getItem('bp.visits')||'[]').length")
        check(visits >= 1, "visit recorded for the check-in")

        # 9. Report form without API -> queued
        await page.click("#report-btn")
        await page.click('#report-form button[type="submit"]')
        check(await page.is_visible("#rep-err"), "empty report shows a validation message")
        await page.fill("#rep-what", "Ngayong 2026 ₱1,500 na raw ang cash gift.")
        await page.click('#report-form button[type="submit"]')
        await page.wait_for_selector("#toast:not([hidden])")
        toast = await page.text_content("#toast")
        check("ipapadala kapag may koneksyon" in toast, f"report queued offline ({toast})")
        outbox = await page.evaluate("JSON.parse(localStorage.getItem('bp.outbox')||'[]').length")
        check(outbox >= 1, "report saved in outbox")

        # 10. Language toggle
        await page.click("#lang-toggle")
        check(await page.is_visible("text=Birthday cash gift for senior citizens"), "English title visible after toggle")
        check(not await page.is_visible("text=Birthday cash gift para sa senior citizen"), "Tagalog title hidden after toggle")
        why = await page.inner_text(".why-box")
        check("Why Nanay qualifies" in why, f"why box re-rendered in English ({why.splitlines()[0]})")
        await page.click("#lang-toggle")

        # 11. Post-visit check-in a day later
        await page.evaluate("""(() => { const v = JSON.parse(localStorage.getItem('bp.visits')); v.forEach(x => x.at = '2026-01-01'); localStorage.setItem('bp.visits', JSON.stringify(v)); })()""")
        await page.goto(BASE + "/")
        await page.wait_for_selector("#checkin")
        check("Nakuha mo ba" in await page.inner_text("#checkin"), "check-in prompt shown on return")
        await page.screenshot(path=f"{SHOTS}/09-checkin.png")
        await page.click('[data-ans="yes"]')
        check(await page.is_visible("text=Salamat! Nakakatulong ito"), "check-in thanks shown")

        # 12. City page search and filter
        await page.goto(BASE + "/calamba/")
        await page.fill("#search", "gamot")
        visible = await page.locator(".card:visible").count()
        check(0 < visible < 18, f"search 'gamot' narrows the list ({visible})")
        await page.fill("#search", "")
        await page.click('[data-filter="student"]')
        visible = await page.locator(".card:visible").count()
        check(visible == 5, f"student filter shows 5 benefits ({visible})")
        await page.screenshot(path=f"{SHOTS}/10-city.png", full_page=True)
        await no_overflow(page, "city")

        # 13. Dark mode detail
        dark = await browser.new_context(viewport={"width": 390, "height": 844}, color_scheme="dark", device_scale_factor=2)
        dp = await dark.new_page()
        await dp.goto(BASE + "/calamba/senior-milestone-cash-gift/")
        await dp.screenshot(path=f"{SHOTS}/11-detail-dark.png", full_page=True)
        bg = await dp.evaluate("getComputedStyle(document.body).backgroundColor")
        check(bg != "rgb(243, 246, 242)", f"dark theme applies ({bg})")

        # 14. Desktop width
        desk = await browser.new_context(viewport={"width": 1280, "height": 900})
        dk = await desk.new_page()
        await dk.goto(BASE + "/calamba/")
        await dk.screenshot(path=f"{SHOTS}/12-city-desktop.png")

        check(not errors, "no script errors" + (": " + "; ".join(errors[:5]) if errors else ""))
        await browser.close()

    print(f"\n{len(failures)} failure(s)")
    sys.exit(1 if failures else 0)


asyncio.run(main())
