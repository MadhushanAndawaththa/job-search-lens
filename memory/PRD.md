# Job Search Lens — PRD / Work Log

## Original Problem Statement
Initial: code review of a LinkedIn-focused Chrome extension with cross-site keyword highlighting; identify and fix all areas of improvement.
Iteration 2: "improve the product page and related and come up with better marketing images."

## Product
Local-only Chrome MV3 extension. Highlights saved keywords on any website; on LinkedIn Jobs it also dims viewed/saved/applied cards and injects company size + follower stats inline.

## Architecture
- `manifest.json` — MV3, content script on http/https.
- `background.js` — service worker, context-menu "Add to Highlighter".
- `shared.js` — pure storage / keyword / regex helpers (Node+browser).
- `dom-heuristics.js` — LinkedIn job list/card detection.
- `content.js` — highlight engine + LinkedIn dim/stats orchestration.
- `popup.html` + `popup.js` + `theme-init.js` — interactive UI.
- `docs/` — GitHub Pages product site (index/privacy/support + marketing templates).
- `tools/render-store-assets.py` — Playwright-based screenshotter for store images.

## Work Completed — 2026-01 Session 1 (Code Review Pass)
- `tabs` → `activeTab`; `version_name`; explicit CSP.
- URL polling gated to LinkedIn; `createHighlightSignature` replaced with O(1) `contentVersion` dirty-counter.
- Removed dead `viewedJobs`/`coerceViewedJobs`/`pruneViewedJobs`.
- Theme: localStorage only (chrome.storage drop).
- Context menu: idempotent `create` (swallowed dup-id error), removed redundant `onInstalled`/`onStartup`.
- Consolidated dual `onMessage` listeners.
- Cached `OWNED_MUTATION_SELECTOR`.
- A11y: Esc closes popover + focus return; aria labels; targeted form-palette toggle.
- `splitKeywordTerms` accepts commas; surrogate-aware `buildLiteralRegex`.
- SVG icons (no emoji) in styles.css; export-clipboard race fixed; setPageStatus diff.
- CI workflow; README + permission table updated.
- 30/30 tests, lint clean.

## Work Completed — 2026-01 Session 2 (Marketing + Product Page)
- **docs/index.html** rebuilt from scratch:
  - New asymmetric hero with version pill, bigger type scale, highlight underline matching extension behavior.
  - Inline product mockup composite (browser frame + active highlighted job card + dimmed viewed/saved cards + floating popup with keyword list) — all HTML/CSS, no external image dependency.
  - Feature grid with mini in-card demos (live keyword highlight strip, dim-state stack, company-stat pills, privacy line).
  - 3-column step grid replacing flat list.
  - Permissions table updated with `activeTab` (was `tabs`).
  - Dark privacy strip with six "never" promises grid.
  - Bold CTA closer with highlight underline on "same jobs."
  - System dark-mode automatic via `prefers-color-scheme`.
- **docs/privacy-policy.html + docs/support.html** — updated permissions (`tabs` → `activeTab`), updated date to Jan 2026, added "Keyboard shortcuts" support block, polish.
- **docs/style.css** rewritten: layered backgrounds, dark mode tokens, hero mockup styles, feature card variants, permission table, dark privacy strip, prose pages.
- **docs/chrome-web-store-submission.txt** — refreshed copy (LinkedIn-first → universal-first), updated permission justifications, regeneration steps.
- **3 new marketing images** (browser-rendered for pixel-perfect sharp text):
  - `small-promo-440x280.png` — dark, condensed, headline + brand + feature tags + CTA pill.
  - `marquee-1400x560.png` — split asymmetric layout with full product mockup (browser + popup) on the right.
  - `store-preview-1280x800.png` — light theme, 4-panel feature overview with live demos of each feature + dark privacy panel.
- **tools/render-store-assets.py** — repeatable Playwright pipeline so the assets are regeneratable on every product update.

## Tests
30/30 passing. Lint clean.

## Files Changed (Session 2)
- `docs/index.html`, `docs/style.css`, `docs/privacy-policy.html`, `docs/support.html`, `docs/chrome-web-store-submission.txt`.
- `docs/marketing/small-promo.html`, `docs/marketing/marquee.html`, `docs/marketing/store-preview.html` (new).
- `tools/render-store-assets.py` (new).
- `assets/store/small-promo-440x280.png`, `assets/store/marquee-1400x560.png`, `assets/store/store-preview-1280x800.png` (regenerated).

## Work Completed — 2026-01 Session 3 (Pre-Launch Bundle)
- **Real popup screenshot** (`assets/store/popup-screenshot-1280x800.png`) — composite of the actual `popup.html` rendered in a Playwright iframe over a branded canvas. Real, faithful product image (no mockup).
- **Open Graph image** (`assets/store/og-image-1200x630.png`) — 1200×630 social share asset, wired into `docs/index.html` meta tags.
- **Production zip** (`dist/job-search-lens-v1.3.0.zip`) — 40 KB, 15 files, dev assets stripped (no tests, node_modules, docs, .git).
- **Go-live runbook** (`docs/go-live.md`) — 10-step Chrome Web Store submission guide with copy-paste-ready listing copy, permission justifications, and post-launch comms checklist.
- **Pre-flight audit** — verified no `console.log`/`debugger`/`TODO` in shipped code; manifest validates; all 30 tests still pass.
- **tools/render-launch-assets.py** — Playwright pipeline for the popup composite + OG image.

## Work Completed — 2026-01 Session 4 (Contrast Fix + De-OSS Messaging)
- **Dark-bg headline contrast fix** — The `.hl` highlight on dark images (marquee, small-promo, og-image) used a half-height yellow strip behind dark text, which made the top half of the text read dark-on-dark. Switched to full-coverage yellow background with rounded corners and `box-decoration-break: clone` so the dark text reads cleanly on any background. Light-bg pages (docs/index.html hero + CTA closer, store-preview) keep the elegant half-highlight underline.
- **Removed all "open source" claims** from public-facing surfaces:
  - `docs/index.html`: `Free · Open source · Local-only · MV3` → `Free · Privacy-first · Local-only · Chrome MV3`; CTA buttons point at Chrome Web Store (placeholder URL) instead of GitHub repo; "Inspect every line of source on GitHub" rewritten to focus on local-only / inspectable via `chrome://extensions`; nav + footer aria-labels changed to "Project on GitHub" (neutral); MIT + Commons Clause line removed from footer copyright.
  - `docs/privacy-policy.html`: "Open source" heading replaced with "How we keep this promise" explaining the local-only architecture.
  - `docs/marketing/store-preview.html`: "Open source" tag → "Maintained"; footer line updated.
  - `docs/marketing/og-image.html`: tag updated to "Local-only · Privacy-first".
  - `docs/chrome-web-store-submission.txt` + `docs/go-live.md`: detailed description copy updated.
- **Re-rendered all 5 marketing assets** with the new copy and contrast at exact pixel dimensions.
- **Updated `tools/render-store-assets.py`** to include the 2x→1x resize + optimize step so future regenerations don't need manual cleanup.
- **Verified by visual analysis** — both marquee and small-promo confirmed: "On every job site" clearly readable with strong contrast, no "Open source" badge anywhere.

## Backlog / Future
- P2: Real annotated screenshot (popup over live LinkedIn) as a second store screenshot.
- P2: Optional `host_permissions` flow for per-site grants.
- P2: `_locales/en/messages.json` + `default_locale` for i18n.
- P2: Open Graph image asset specifically sized for social shares (1200x630).
- P3: Push-based popup diagnostics (replace 1.5 s polling).
- P3: Differential re-highlight (only walk MutationRecord subtrees).
- P3: "Keyword preset packs" (export/import JSON) — see prior enhancement note.
