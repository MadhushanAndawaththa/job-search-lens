"""Render marketing HTML files to PNG at exact Chrome Web Store dimensions."""
from playwright.sync_api import sync_playwright

TARGETS = [
    {
        "url": "http://localhost:8765/docs/marketing/small-promo.html",
        "out": "/app/assets/store/small-promo-440x280.png",
        "w": 440,
        "h": 280,
    },
    {
        "url": "http://localhost:8765/docs/marketing/marquee.html",
        "out": "/app/assets/store/marquee-1400x560.png",
        "w": 1400,
        "h": 560,
    },
    {
        "url": "http://localhost:8765/docs/marketing/store-preview.html",
        "out": "/app/assets/store/store-preview-1280x800.png",
        "w": 1280,
        "h": 800,
    },
]


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        for t in TARGETS:
            context = browser.new_context(
                viewport={"width": t["w"], "height": t["h"]},
                device_scale_factor=2,  # crisp for hi-DPI
            )
            page = context.new_page()
            page.goto(t["url"], wait_until="networkidle")
            # Wait a beat for fonts/layout to fully settle.
            page.wait_for_timeout(500)
            page.screenshot(
                path=t["out"],
                clip={"x": 0, "y": 0, "width": t["w"], "height": t["h"]},
                omit_background=False,
            )
            print(f"wrote {t['out']} ({t['w']}x{t['h']})")
            context.close()
        browser.close()


if __name__ == "__main__":
    main()
