import asyncio, json, sys
from playwright.async_api import async_playwright

BASE = "https://release-trust.preview.emergentagent.com"
ROUTES = {
    "landing": "/", "auth": "/login", "founder": "/app/founder", "developer": "/app/developer",
    "projects": "/app/projects", "project-detail": "/app/projects/prj_demo_aurora",
    "releases": "/app/releases", "release-detail": "/app/releases/rel_bc87f69fa8b5",
    "evidence-detail": "/app/evidence/evd_19d9829a550f", "deployments": "/app/deployments",
    "deployment-detail": "/app/deployments/dep_demo_vault", "integrations": "/app/integrations",
    "permissions": "/app/permissions", "findings": "/app/findings", "drift": "/app/drift",
    "incidents": "/app/incidents", "incident-detail": "/app/incidents/inc_da66450d72da",
    "graph": "/app/graph", "settings": "/app/settings", "demo": "/app/demo",
}
VIEWPORTS = {"desktop": (1440, 900), "laptop": (1280, 800), "tablet": (768, 1024), "mobile": (390, 844)}

JS = """
() => {
  const de = document.documentElement;
  const out = { hOverflow: de.scrollWidth - de.clientWidth, offscreen: [], clipped: [], tiny: [] };
  const vw = de.clientWidth;
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' && el.closest('canvas')) continue;
    if (r.right > vw + 2 && r.width > 10 && !el.closest('[data-testid=trust-graph-2d]')) {
      out.offscreen.push({ tag: el.tagName, tid: el.getAttribute('data-testid'), cls: (el.className||'').toString().slice(0,80), right: Math.round(r.right), text: (el.innerText||'').slice(0,40) });
    }
    const isScrollable = /auto|scroll/.test(cs.overflowX) || /auto|scroll/.test(cs.overflowY);
    if (!isScrollable && (cs.overflow === 'hidden' || cs.overflowX === 'hidden') && el.scrollWidth > el.clientWidth + 2 && !cs.textOverflow.includes('ellipsis') && !el.closest('canvas') && el.tagName !== 'svg' && el.tagName !== 'CANVAS' && !el.classList.contains('vx-scan') && !el.classList.contains('vx-noise')) {
      out.clipped.push({ tag: el.tagName, tid: el.getAttribute('data-testid'), cls: (el.className||'').toString().slice(0,80), sw: el.scrollWidth, cw: el.clientWidth, text: (el.innerText||'').slice(0,40) });
    }
    if (cs.textOverflow.includes('ellipsis') && el.scrollWidth > el.clientWidth + 2) {
      out.clipped.push({ ellipsis: true, tid: el.getAttribute('data-testid'), cls: (el.className||'').toString().slice(0,60), text: (el.innerText||'').slice(0,40), title: el.title || el.closest('[title]')?.title ? 'has-title' : 'no-title' });
    }
    const fs = parseFloat(cs.fontSize);
    if (fs && fs < 10 && (el.innerText||'').trim() && el.children.length === 0) out.tiny.push({ fs, text: (el.innerText||'').slice(0,30), cls: (el.className||'').toString().slice(0,60) });
  }
  out.offscreen = out.offscreen.slice(0, 8); out.clipped = out.clipped.slice(0, 10); out.tiny = out.tiny.slice(0, 6);
  return out;
}
"""

async def main(only=None):
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await ctx.new_page()
        await page.goto(BASE + "/login", wait_until="networkidle")
        await page.fill('[data-testid="login-email-input"]', "admin@veridex.dev")
        await page.fill('[data-testid="login-password-input"]', "Veridex!2026")
        await page.click('[data-testid="login-submit-button"]')
        await page.wait_for_url("**/app/**", timeout=20000)
        report = {}
        for vname, (w, h) in VIEWPORTS.items():
            if only and vname not in only: continue
            await page.set_viewport_size({"width": w, "height": h})
            for rname, path in ROUTES.items():
                errors, failed = [], []
                on_c = lambda m: errors.append(m.text[:160]) if m.type == "error" else None
                on_rf = lambda r: failed.append(r.url[-80:])
                on_rs = lambda r: failed.append(f"{r.status} {r.url[-70:]}") if r.status >= 400 else None
                page.on("console", on_c); page.on("requestfailed", on_rf); page.on("response", on_rs)
                try:
                    await page.goto(BASE + path, wait_until="networkidle", timeout=30000)
                    await page.wait_for_timeout(1500)
                    blank = (await page.evaluate("document.body.innerText.trim().length")) < 40
                    res = await page.evaluate(JS)
                    res["blank"] = blank
                    res["errors"] = list(dict.fromkeys(errors))[:5]
                    res["failed"] = list(dict.fromkeys(failed))[:5]
                except Exception as ex:
                    res = {"exception": str(ex)[:200]}
                page.remove_listener("console", on_c); page.remove_listener("requestfailed", on_rf); page.remove_listener("response", on_rs)
                report[f"{vname}:{rname}"] = res
                flags = {k: v for k, v in res.items() if v and v != 0 and k != "blank"} if "exception" not in res else res
                if res.get("blank"): flags["BLANK"] = True
                print(f"[{vname}:{rname}]", json.dumps(flags)[:900] if flags else "OK", flush=True)
        json.dump(report, open("/app/tests/visual_audit_report.json", "w"), indent=1)
        await browser.close()

asyncio.run(main(sys.argv[1:] or None))
