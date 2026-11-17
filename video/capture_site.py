"""Capture the real website for the film: the hero, the brand explorer before and after choosing
Deliveroo, and the agent section, at 3x for sharp zooms. Serve the site first:
    python -m http.server 8768 --directory site
"""
import json, asyncio
from playwright.async_api import async_playwright
OUT = "video/film/public/site"
URL = "http://localhost:8768/index.html"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox"])
        pg = await b.new_page(viewport={"width": 1280, "height": 1120}, device_scale_factor=3)
        await pg.goto(URL, wait_until="networkidle")
        await pg.wait_for_timeout(1500)
        meta = {}
        await pg.screenshot(path=f"{OUT}/hero.jpg", type="jpeg", quality=92)
        # brand explorer, before and after choosing Deliveroo
        await pg.evaluate("document.getElementById('explorer').scrollIntoView({block:'start'})")
        await pg.wait_for_timeout(600)
        meta["first"] = await pg.evaluate("document.getElementById('exName').textContent")
        chip = pg.locator("#chips button[data-id='deliveroo']")
        meta["chip_count"] = await pg.locator("#chips button").count()
        await chip.scroll_into_view_if_needed()
        await pg.evaluate("document.getElementById('explorer').scrollIntoView({block:'start'})")
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=f"{OUT}/explorer_before.jpg", type="jpeg", quality=92)
        box = await chip.bounding_box()
        meta["chip"] = box
        await chip.click()
        await pg.wait_for_timeout(900)
        await pg.screenshot(path=f"{OUT}/explorer_after.jpg", type="jpeg", quality=92)
        meta["bars"] = await pg.locator("#exBars").locator("xpath=..").bounding_box()
        meta["after_name"] = await pg.evaluate("document.getElementById('exName').textContent")
        # the agent section with the E.Leclerc brief
        await pg.evaluate("document.getElementById('agent').scrollIntoView({block:'start'})")
        await pg.wait_for_timeout(9000)  # let the console replay its logged steps
        await pg.screenshot(path=f"{OUT}/agent.jpg", type="jpeg", quality=92)
        meta["brief"] = await pg.locator("#brief").bounding_box()
        meta["scrollY_agent"] = await pg.evaluate("scrollY")
        json.dump(meta, open(f"{OUT}/meta.json", "w"), indent=1)
        print(json.dumps(meta, indent=1))
        await b.close()
asyncio.run(main())
