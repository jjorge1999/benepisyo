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


async def title_is(page, text, timeout=5000):
    """Wait until the question title shows `text` (the UI redraws on the next tick), then return it."""
    try:
        await page.wait_for_function("t => (document.querySelector('#q-title')||{}).textContent && document.querySelector('#q-title').textContent.includes(t)", arg=text, timeout=timeout)
    except Exception:
        pass
    return (await page.text_content("#q-title")) or ""


async def settle(page):
    await page.wait_for_timeout(250)


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
        title = await title_is(page, "Ilang taon na si Nanay?")
        check(title.strip() == "Ilang taon na si Nanay?", f"age question uses the name ({title.strip()})")
        await page.click("text=60 hanggang 79")
        title = await title_is(page, "Nakatira ba si Nanay sa Calamba?")
        check("Nakatira ba si Nanay sa Calamba?" in title, f"resident question ({title.strip()})")
        await page.click('.choice:has-text("Oo")')
        await title_is(page, "kita")
        await page.click("text=Minimum wage pababa, o walang regular na kita")
        await title_is(page, "pension")
        await page.click('.choice:has-text("Hindi")')  # no pension
        title = await title_is(page, "Alin ang mayroon na si Nanay?")
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
        await page.click(".ant-modal-close")
        await page.wait_for_selector(".ant-modal", state="hidden", timeout=5000)
        visits = await page.evaluate("JSON.parse(localStorage.getItem('bp.visits')||'[]').length")
        check(visits >= 1, "visit recorded for the check-in")

        # 9. Report form without API -> queued
        await page.click("#report-btn")
        await page.click('#report-form button[type="submit"]')
        await page.wait_for_selector("#rep-err")
        check(await page.is_visible("#rep-err"), "empty report shows a validation message")
        await page.fill("#rep-what", "Ngayong 2026 ₱1,500 na raw ang cash gift.")
        await page.click('#report-form button[type="submit"]')
        await page.wait_for_selector(".ant-message-notice")
        toast = await page.text_content(".ant-message-notice")
        check("ipapadala kapag may koneksyon" in toast, f"report queued offline ({toast})")
        outbox = await page.evaluate("JSON.parse(localStorage.getItem('bp.outbox')||'[]').length")
        check(outbox >= 1, "report saved in outbox")

        # 10. Language toggle
        await page.wait_for_selector(".ant-modal", state="hidden", timeout=5000)
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
        await settle(page)
        check(await page.is_visible("text=Salamat! Nakakatulong ito"), "check-in thanks shown")

        # 12. City page search and filter
        await page.goto(BASE + "/calamba/")
        await page.wait_for_selector(".ant-pagination")
        total = int((await page.text_content("#result-count")).split()[2])
        cards = await page.locator(".card").count()
        check(cards == 8 and total > 8, f"only one page of cards is rendered ({cards} of {total})")
        first = await page.text_content(".card .title")
        await page.click('.ant-pagination-item[title="2"]')
        await page.wait_for_timeout(300)
        check(await page.text_content(".card .title") != first, "page 2 shows different benefits")
        await page.fill("#search", "gamot")
        await settle(page)
        n = int((await page.text_content("#result-count")).split()[0])
        check(0 < n < total and await page.locator(".card").count() == min(n, 8), f"search 'gamot' narrows the list ({n} of {total})")
        await page.fill("#search", "")
        await settle(page)
        await page.click('[data-filter="student"]')
        await settle(page)
        groups = await page.eval_on_selector_all(".card", "els => els.map(e => e.dataset.groups)")
        sn = int((await page.text_content("#result-count")).split()[0])
        check(groups and all("student" in g.split() for g in groups) and sn < total, f"student filter shows only student benefits ({sn} of {total})")
        await page.click('.ant-segmented-item:has-text("Calamba")')
        await page.click('[data-filter="all"]')
        await settle(page)
        lv = await page.eval_on_selector_all(".card app-level-tag .ant-tag", "els => els.map(e => e.textContent)")
        check(lv and all("Calamba" in x for x in lv), "Calamba-only toggle shows local benefits")
        await page.screenshot(path=f"{SHOTS}/10-city.png", full_page=True)
        await no_overflow(page, "city")

        # 13. Household flow
        fam = await browser.new_context(viewport={"width": 390, "height": 844})
        fp = await fam.new_page()
        await fp.goto(BASE + "/")
        await fp.fill("#city-input", "Calamba")
        await fp.click("#city-next")
        await fp.click('[data-group="family"]')
        await fp.click("#who-next")
        await fp.click('.choice:has-text("Oo")')                       # resident
        await title_is(fp, "kita")
        await fp.click("text=Minimum wage pababa, o walang regular na kita")
        t4 = await title_is(fp, "Kasama ba ang pamilya mo sa 4Ps?")
        check("Kasama ba ang pamilya mo sa 4Ps?" in t4, f"4Ps question ({t4.strip()})")
        await fp.click('.choice:has-text("Hindi")')                    # not in 4Ps
        await title_is(fp, "anak")
        await fp.click('.choice:has-text("Oo")')                       # has children
        await title_is(fp, "trabaho")
        await fp.click('.choice:has-text("Hindi")')                    # did not lose job
        await title_is(fp, "Alin ang mayroon")
        await fp.click('[data-doc="__none"]')
        await fp.click("#q-done")
        await fp.wait_for_selector(".unlock")
        ft = await fp.inner_text("#app")
        check("4Ps: buwanang cash grant" in ft, "household sees 4Ps")
        check("Kumuha muna ng Certificate of Indigency" in ft, "household told to get a Certificate of Indigency first")
        check("Tulong pinansyal sa pagpapalibing" in ft, "household sees Calamba burial aid")
        check("Hanggang" in ft and "UPLIFT" in ft, "UPLIFT shows its end date")
        await fp.screenshot(path=f"{SHOTS}/13-household.png", full_page=True)

        # 14. Location prefill (computed on the phone)
        for coords, label, expect in [((14.2117, 121.1653), "Calamba", "Calamba"), ((14.3122, 121.1114), "Santa Rosa", "Santa Rosa")]:
            gctx = await browser.new_context(viewport={"width": 390, "height": 844}, geolocation={"latitude": coords[0], "longitude": coords[1]}, permissions=["geolocation"])
            gp = await gctx.new_page()
            await gp.goto(BASE + "/")
            await gp.wait_for_function("document.querySelector('#city-input') && document.querySelector('#city-input').value", timeout=8000)
            val = await gp.input_value("#city-input")
            check(val == expect, f"location in {label} prefills the city ({val})")
            if label == "Calamba":
                check(await gp.is_visible("text=Kumpleto ang lokal na benepisyo dito."), "prefilled Calamba is recognised as supported")
                await gp.screenshot(path=f"{SHOTS}/14-geo.png")
            else:
                check(await gp.is_visible("text=Wala pa kaming lokal na benepisyo para sa Santa Rosa"), "prefilled unsupported town shows the national-only note")
            await gctx.close()
        far = await browser.new_context(viewport={"width": 390, "height": 844}, geolocation={"latitude": 10.3157, "longitude": 123.8854}, permissions=["geolocation"])
        fp2 = await far.new_page()
        await fp2.goto(BASE + "/")
        await fp2.wait_for_selector("text=Mukhang wala ka sa Laguna", timeout=8000)
        check(await fp2.input_value("#city-input") == "", "outside Laguna leaves the city empty")
        await far.close()
        nogeo = await browser.new_context(viewport={"width": 390, "height": 844})
        np_ = await nogeo.new_page()
        await np_.goto(BASE + "/")
        await np_.wait_for_timeout(800)
        check(await np_.input_value("#city-input") == "", "no prompt or prefill without permission")
        await nogeo.close()

        # 15. Dark mode detail
        dark = await browser.new_context(viewport={"width": 390, "height": 844}, color_scheme="dark", device_scale_factor=2)
        dp = await dark.new_page()
        await dp.goto(BASE + "/calamba/senior-milestone-cash-gift/")
        await dp.screenshot(path=f"{SHOTS}/11-detail-dark.png", full_page=True)
        await dp.wait_for_timeout(800)
        bg = await dp.evaluate("getComputedStyle(document.querySelector('.bp-layout')).backgroundColor")
        check(bg in ("rgb(0, 0, 0)",) or bg.startswith("rgb(0,") or bg.startswith("rgb(2") is False, f"dark theme applies ({bg})")

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
