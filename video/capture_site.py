"""Capture the real website for the film's website scene: the hero ledger on Deliveroo, then
after choosing BNP Paribas, at 3x for sharp zooms. Serve the site first:
    python -m http.server 8768 --directory site
"""
import asyncio
import json
import sys

from playwright.async_api import async_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else "video/film/public/site"
URL = "http://localhost:8768/index.html"


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox"])
        pg = await b.new_page(viewport={"width": 1280, "height": 1000}, device_scale_factor=3)
        await pg.goto(URL, wait_until="networkidle")
        await pg.wait_for_timeout(2500)  # let the star meter fill
        meta = {"viewport": [1280, 1000]}
        await pg.screenshot(path=f"{OUT}/hero_deliveroo.jpg", type="jpeg", quality=92)
        pick = pg.locator("#heroBook button[data-id]", has_text="BNP Paribas")
        meta["pick"] = await pick.bounding_box()
        meta["book"] = await pg.locator("#heroBook").bounding_box()
        await pick.click()
        await pg.wait_for_timeout(2500)
        await pg.screenshot(path=f"{OUT}/hero_bnp.jpg", type="jpeg", quality=92)
        json.dump(meta, open(f"{OUT}/meta.json", "w"), indent=1)
        print(json.dumps(meta))
        await b.close()

asyncio.run(main())
