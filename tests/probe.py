import asyncio, json, sys
from playwright.async_api import async_playwright
BASE = "https://release-trust.preview.emergentagent.com"
path = sys.argv[1]; w = int(sys.argv[2]); h = int(sys.argv[3]); js = sys.argv[4]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await (await b.new_context(viewport={"width": w, "height": h})).new_page()
        await pg.goto(BASE + "/login", wait_until="networkidle")
        await pg.fill('[data-testid="login-email-input"]', "admin@veridex.dev"); await pg.fill('[data-testid="login-password-input"]', "Veridex!2026")
        await pg.click('[data-testid="login-submit-button"]'); await pg.wait_for_url("**/app/**", timeout=20000)
        await pg.goto(BASE + path, wait_until="networkidle"); await pg.wait_for_timeout(1500)
        print(json.dumps(await pg.evaluate(js), indent=1)[:3000])
        if len(sys.argv) > 5: await pg.screenshot(path=sys.argv[5], full_page=len(sys.argv) > 6)
        await b.close()
asyncio.run(main())
