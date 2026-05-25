"""Pre-launch asset bundle:
  1. Real popup screenshot (the actual extension UI, not a mockup).
  2. Open Graph image (1200x630) for social shares.
  Then resize to exact target dimensions.
"""
from playwright.sync_api import sync_playwright

TARGETS = [
    # Dark-mode popup screenshot used as a static asset inside og-image.html.
    # Must render first so the PNG exists when og-image.html loads it.
    {
        "url": "http://localhost:8765/popup.html",
        "out": "/app/docs/assets/store/popup-dark-preview.png",
        "viewport_w": 380,
        "viewport_h": 660,
        "final_w": 380,
        "final_h": 660,
        "kind": "popup-dark",
    },
    # Real popup UI rendered from popup.html.
    # popup.html is fixed at 380x660 — we render it at 2x then scale.
    {
        "url": "http://localhost:8765/popup.html",
        "out": "/app/docs/assets/store/popup-screenshot-1280x800.png",
        "viewport_w": 1280,
        "viewport_h": 800,
        "final_w": 1280,
        "final_h": 800,
        "kind": "popup-composite",
    },
    # Open Graph image (1200x630)
    {
        "url": "http://localhost:8765/docs/marketing/og-image.html",
        "out": "/app/docs/assets/store/og-image-1200x630.png",
        "viewport_w": 1200,
        "viewport_h": 630,
        "final_w": 1200,
        "final_h": 630,
        "kind": "raw",
    },
]


def render_popup_dark(browser, t):
    """Render popup.html in dark mode as a static PNG — used by og-image.html."""
    context = browser.new_context(
        viewport={"width": t["viewport_w"], "height": t["viewport_h"]},
        device_scale_factor=2,
        color_scheme="dark",
    )
    page = context.new_page()
    page.goto(t["url"], wait_until="networkidle")
    page.wait_for_timeout(1000)
    page.screenshot(
        path=t["out"],
        clip={"x": 0, "y": 0, "width": t["viewport_w"], "height": t["viewport_h"]},
    )
    context.close()


def render_raw(browser, t):
    context = browser.new_context(
        viewport={"width": t["viewport_w"], "height": t["viewport_h"]},
        device_scale_factor=2,
    )
    page = context.new_page()
    page.goto(t["url"], wait_until="networkidle")
    page.wait_for_timeout(500)
    page.screenshot(
        path=t["out"],
        clip={"x": 0, "y": 0, "width": t["viewport_w"], "height": t["viewport_h"]},
    )
    context.close()


def render_popup_composite(browser, t):
    """Render the actual popup.html on a soft branded canvas so the resulting
    1280x800 screenshot reads as a real product shot, not a webpage."""
    # Inline composite page: load popup.html in an iframe sized to 380x660
    # over a friendly gradient backdrop. Saves a real, faithful product image.
    composite = """<!doctype html><html><head><meta charset="utf-8"><style>
        html, body { margin:0; padding:0; width:1280px; height:800px; overflow:hidden;
                     font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        body {
          position: relative;
          background:
            radial-gradient(45% 60% at 12% 10%, rgba(250,204,21,0.16), transparent 65%),
            radial-gradient(50% 65% at 95% 92%, rgba(10,102,194,0.16), transparent 65%),
            linear-gradient(140deg, #f7f8fb 0%, #eef2f8 100%);
          display: grid;
          grid-template-columns: 1.0fr 1.05fr;
          align-items: center;
          padding: 30px 76px;
          color: #0b1220;
        }
        .left { padding-right: 24px; }
        .brand-row { display:flex; align-items:center; gap:14px; margin-bottom: 28px; }
        .icon { width:48px; height:48px; border-radius:12px;
          background: linear-gradient(135deg, #0b1220, #1b2440); color: #facc15;
          display:grid; place-items:center; box-shadow: 0 8px 24px rgba(11,18,32,0.18); }
        .icon svg { width: 26px; height: 26px; }
        .brand { font-size: 22px; font-weight: 700; letter-spacing:-0.02em; }
        h1 { font-size: 60px; font-weight: 800; letter-spacing: -0.035em; line-height: 1.02; max-width: 580px; }
        h1 .hl { background: linear-gradient(180deg, transparent 58%, #facc15 58% 92%, transparent 92%); padding: 0 0.05em; }
        p.lede { margin-top: 18px; font-size: 18px; color: #5b6478; line-height: 1.5; max-width: 540px; }
        .tags { margin-top: 26px; display:flex; gap:8px; flex-wrap:wrap; }
        .tag { padding: 7px 13px; border-radius:999px; background: #fff; border: 1px solid #e5e7ec;
               font-size: 13px; font-weight: 600; color: #1d2435; box-shadow: 0 1px 2px rgba(11,18,32,0.04); }
        .tag.y { background:#fef3c7; color:#92400e; border-color:#fde68a; }
        .stage { display:flex; align-items:center; justify-content:center; position: relative; }
        .frame { position: relative;
          border-radius: 28px;
          background: linear-gradient(160deg, #ffffff 0%, #f3f6fb 100%);
          padding: 16px;
          box-shadow: 0 40px 80px -20px rgba(11,18,32,0.30), 0 16px 32px -16px rgba(11,18,32,0.15);
          border: 1px solid #e5e7ec;
        }
        .frame iframe {
          width: 380px; height: 660px; border: 1px solid #e5e7ec; border-radius: 16px;
          background: #fff; display:block; box-shadow: 0 6px 18px rgba(11,18,32,0.10);
        }
        .caption { margin-top: 14px; text-align: center; font-size: 12.5px; color: #5b6478; font-weight: 500; }
      </style></head><body>
        <div class="left">
          <div class="brand-row">
            <span class="icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            </span>
            <span class="brand">Job Search Lens</span>
          </div>
          <h1>This is the<br>actual popup.<br><span class="hl">No mockup.</span></h1>
          <p class="lede">Add keywords, pick colors, toggle Viewed&nbsp;/&nbsp;Saved&nbsp;/&nbsp;Applied dimming, and jump straight to the product website from the footer. Everything stays local.</p>
          <div class="tags">
            <span class="tag y">Free</span>
            <span class="tag">Chrome MV3</span>
            <span class="tag">Local-only</span>
            <span class="tag">Built for LinkedIn</span>
          </div>
        </div>
        <div class="stage">
          <div>
            <div class="frame"><iframe src="http://localhost:8765/popup.html" loading="eager"></iframe></div>
            <p class="caption">The real popup at native size · 380×660</p>
          </div>
        </div>
      </body></html>"""

    context = browser.new_context(
        viewport={"width": 1280, "height": 800},
        device_scale_factor=2,
    )
    page = context.new_page()
    page.set_content(composite)
    # Wait for the iframe (popup.html) to fully render
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1000)
    page.screenshot(
        path=t["out"],
        clip={"x": 0, "y": 0, "width": 1280, "height": 800},
    )
    context.close()


def main():
    from PIL import Image
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        for t in TARGETS:
            if t["kind"] == "popup-dark":
                render_popup_dark(browser, t)
            elif t["kind"] == "popup-composite":
                render_popup_composite(browser, t)
            else:
                render_raw(browser, t)
            # Resize to exact dimensions (we rendered at 2x for crispness).
            im = Image.open(t["out"])
            if im.size != (t["final_w"], t["final_h"]):
                im = im.resize((t["final_w"], t["final_h"]), Image.LANCZOS)
                im.save(t["out"], optimize=True)
            print(f"wrote {t['out']} {im.size}")
        browser.close()


if __name__ == "__main__":
    main()
